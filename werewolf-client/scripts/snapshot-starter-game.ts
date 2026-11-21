import {readFileSync} from "fs";
import {db} from "../firebase/server";
import {AVATAR_VARIANTS_COLLECTION, GAME_ROLES, GAME_STATES, MessageType} from "../app/api/game-models";
import {isIllustrationDocId, STARTER_GAMES_COLLECTION, StarterBot, StarterTemplate} from "../app/utils/starter-games";
import {isStarterModel} from "../app/ai/model-limit-utils";
import {isAllowedAsGameMaster} from "../app/ai/ai-models";

/**
 * Turns a real game into a starter template (docs/plan-growth-roadmap.md, track 1).
 *
 * How a template is made:
 *   1. Create a game with the normal form: 7 players, 2 werewolves, Doctor + Detective, the
 *      theme and instructions of the starter story. Name yourself with a distinctive one-word
 *      name (e.g. "Rowan"): it becomes the placeholder that each player's own name replaces.
 *   2. On the preview, edit the cast until it reads well. Create the game.
 *   3. Let the characters introduce themselves. Do NOT send a message.
 *   4. Reroll portraits until every character has good candidates; select the best ones.
 *   5. Run this script. The template is written as a draft; review, then publish it.
 *
 * Usage (from werewolf-client/, sandbox off):
 *   npx tsx --env-file=.env scripts/snapshot-starter-game.ts <gameId> --id tavern \
 *       --title "The Last Lantern" --hook "Rain on the roof, ale on the table…" [--order 1] [--dry-run]
 *       [--drop-maniac]            leave the Maniac off the template's role list
 *       [--story-file <path>]      use this text as the opening story instead of the generated one
 *   npx tsx --env-file=.env scripts/snapshot-starter-game.ts --set-story tavern --story-file <path>
 *   npx tsx --env-file=.env scripts/snapshot-starter-game.ts --publish tavern
 *   npx tsx --env-file=.env scripts/snapshot-starter-game.ts --unpublish tavern
 *   npx tsx --env-file=.env scripts/snapshot-starter-game.ts --list
 *
 * Re-running with the same --id replaces the template: its portraits, its drawn art styles
 * and its recorded voices are removed and must be made again. Games already created from it
 * keep their own copies of the portraits.
 */

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function setStatus(templateId: string, status: 'draft' | 'live') {
    const ref = db!.collection(STARTER_GAMES_COLLECTION).doc(templateId);
    if (!(await ref.get()).exists) throw new Error(`No starter template "${templateId}"`);
    await ref.update({status});
    console.log(`${templateId}: ${status}`);
}

async function list() {
    const snapshot = await db!.collection(STARTER_GAMES_COLLECTION).get();
    for (const doc of snapshot.docs) {
        const t = doc.data() as StarterTemplate;
        console.log(`${doc.id.padEnd(20)} ${t.status.padEnd(6)} order ${t.order}  ${t.bots.length + 1} players  "${t.title}"  (from ${t.sourceGameId})`);
    }
    if (snapshot.empty) console.log('No starter templates.');
}

async function deleteCollection(ref: FirebaseFirestore.CollectionReference) {
    const docs = await ref.listDocuments();
    for (let i = 0; i < docs.length; i += 20) {
        const batch = db!.batch();
        docs.slice(i, i + 20).forEach(d => batch.delete(d));
        await batch.commit();
    }
}

async function snapshot(gameId: string) {
    const templateId = arg('id');
    const title = arg('title');
    const hook = arg('hook');
    if (!templateId || !/^[a-z0-9-]{1,40}$/.test(templateId)) throw new Error('--id is required: lowercase letters, digits and dashes');
    if (!title || !hook) throw new Error('--title and --hook are required (the card copy)');
    const order = Number(arg('order') ?? 100);

    const gameRef = db!.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();
    if (!gameDoc.exists) throw new Error(`Game ${gameId} not found`);
    const game = gameDoc.data() as any;

    const problems: string[] = [];
    if (game.gameState !== GAME_STATES.DAY_DISCUSSION || game.currentDay !== 1) {
        problems.push(`the game must be in day 1's discussion, right after the introductions (it is ${game.gameState}, day ${game.currentDay})`);
    }
    if (game.avatarsStatus !== 'ready') problems.push(`portraits are not ready (avatarsStatus = ${game.avatarsStatus})`);
    // Starter games have no Maniac. Roles are dealt per game from the template's list, not
    // copied from the source game, so --drop-maniac simply leaves it off the list (the
    // freed seat becomes a villager). The opening story may still mention it: check it.
    const specialRoles: string[] = (game.specialRoles ?? []).filter((role: string) => !(flag('drop-maniac') && role === GAME_ROLES.MANIAC));
    if (specialRoles.includes(GAME_ROLES.MANIAC)) problems.push('starter games have no Maniac (recreate the game without it, or pass --drop-maniac)');
    const roleSlots = (game.werewolfCount ?? 0) + specialRoles.length;
    if (roleSlots > game.bots.length) problems.push(`${roleSlots} role slots do not fit ${game.bots.length} bots (the human is always a villager)`);

    const messagesSnapshot = await gameRef.collection('messages').orderBy('timestamp').get();
    const messages = messagesSnapshot.docs.map(d => d.data());
    const unexpected = messages.filter(m => ![MessageType.GAME_STORY, MessageType.GM_COMMAND, MessageType.BOT_WELCOME].includes(m.messageType));
    if (unexpected.length > 0) {
        problems.push(`the game has ${unexpected.length} message(s) after the introductions (${[...new Set(unexpected.map(m => m.messageType))].join(', ')}); snapshot a game nobody has talked in`);
    }

    const intros = new Map<string, string>();
    const introOrder: string[] = [];
    for (const m of messages) {
        if (m.messageType !== MessageType.BOT_WELCOME) continue;
        const reply = typeof m.msg === 'string' ? m.msg : m.msg?.reply;
        if (!intros.has(m.authorName)) introOrder.push(m.authorName);
        intros.set(m.authorName, String(reply ?? '').trim());
    }
    const bots: StarterBot[] = [];
    for (const name of introOrder) {
        const bot = game.bots.find((b: any) => b.name === name);
        if (!bot) { problems.push(`introduction by "${name}", who is not in the cast`); continue; }
        bots.push({
            name: bot.name,
            story: bot.story,
            gender: bot.gender,
            voice: bot.voice,
            ...(bot.voiceStyle ? {voiceStyle: bot.voiceStyle} : {}),
            playStyle: bot.playStyle,
            ...(bot.visualDescription ? {visualDescription: bot.visualDescription} : {}),
            intro: intros.get(name)!,
        });
    }
    for (const bot of game.bots) {
        if (!intros.get(bot.name)) problems.push(`${bot.name} has no introduction`);
    }

    if (problems.length > 0) {
        console.error(`Cannot snapshot ${gameId}:\n` + problems.map(p => `  - ${p}`).join('\n'));
        process.exit(1);
    }

    // --story-file replaces the generated opening story (the first thing a player hears).
    const storyFile = arg('story-file');
    const story: string = storyFile ? readFileSync(storyFile, 'utf8').trim() : game.story;
    if (!story) throw new Error('The opening story is empty');
    if (/maniac/i.test(story) && !specialRoles.includes(GAME_ROLES.MANIAC)) {
        console.warn('  WARNING: the opening story mentions a Maniac, but this template has none.');
    }
    for (const bot of bots) {
        if (/maniac/i.test(bot.intro) && !specialRoles.includes(GAME_ROLES.MANIAC)) console.warn(`  WARNING: ${bot.name}'s introduction mentions a Maniac.`);
    }

    const gmModel: string | undefined = isStarterModel(game.gameMasterAiType) && isAllowedAsGameMaster(game.gameMasterAiType)
        ? game.gameMasterAiType
        : undefined;

    const template: Omit<StarterTemplate, 'id'> = {
        status: 'draft',
        order,
        title,
        hook,
        theme: game.theme,
        description: game.description ?? '',
        ...(game.artStyle ? {artStyle: game.artStyle} : {}),
        gameMode: game.gameMode,
        language: game.language ?? 'en',
        longReplies: game.longReplies ?? false,
        ...(game.voiceProvider ? {voiceProvider: game.voiceProvider} : {}),
        gameMasterVoice: game.gameMasterVoice,
        ...(game.gameMasterVoiceStyle ? {gameMasterVoiceStyle: game.gameMasterVoiceStyle} : {}),
        ...(gmModel ? {gameMasterAiType: gmModel} : {}),
        story,
        humanPlaceholder: game.humanPlayerName,
        werewolfCount: game.werewolfCount,
        specialRoles,
        bots,
        avatarsVersion: game.avatarsVersion ?? 1,
        avatarVariants: game.avatarVariants ?? {},
        avatarVersions: game.avatarVersions ?? {},
        sourceGameId: gameId,
        createdAt: Date.now(),
    };

    // Where the placeholder name shows up: these are the spots a player's name will land in.
    const mentions = (text: string) => (text.match(new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${template.humanPlaceholder}(?![\\p{L}\\p{N}\\p{M}])`, 'gu')) ?? []).length;
    console.log(`Template "${templateId}" from ${gameId}`);
    console.log(`  ${bots.length + 1} players, ${template.werewolfCount} werewolves, special: ${template.specialRoles.join(', ') || 'none'}, language ${template.language}, mode ${template.gameMode}`);
    console.log(`  Game Master model: ${gmModel ?? `(dealt per game; ${game.gameMasterAiType} is not a starter model)`}`);
    console.log(`  Human placeholder "${template.humanPlaceholder}": ${mentions(template.story)} mention(s) in the story`);
    for (const bot of bots) {
        const n = mentions(bot.intro) + mentions(bot.story);
        const candidates = template.avatarVariants[bot.name]?.n ?? 1;
        console.log(`  ${bot.name.padEnd(14)} ${candidates} portrait(s)  intro ${bot.intro.length} chars${n ? `, names the human ${n}x` : ''}`);
    }

    const copies: Array<{collection: string; id: string; data: FirebaseFirestore.DocumentData}> = [];
    for (const collection of ['avatars', AVATAR_VARIANTS_COLLECTION]) {
        const docs = await gameRef.collection(collection).get();
        for (const doc of docs.docs) {
            if (isIllustrationDocId(doc.id)) continue;
            const {expireAt: _ttl, ...data} = doc.data();
            void _ttl;
            copies.push({collection, id: doc.id, data});
        }
    }
    console.log(`  ${copies.length} image docs (portraits, candidates, sheets, scenes)`);

    if (flag('dry-run')) {
        console.log('Dry run: nothing written.');
        return;
    }

    const templateRef = db!.collection(STARTER_GAMES_COLLECTION).doc(templateId);
    await deleteCollection(templateRef.collection('avatars'));
    await deleteCollection(templateRef.collection(AVATAR_VARIANTS_COLLECTION));
    // A new snapshot is a new template: its recorded voices and drawn styles go too.
    await deleteCollection(templateRef.collection('audio'));
    // Image docs are large: a few per batch keeps each commit under Firestore's 10 MiB limit.
    for (let i = 0; i < copies.length; i += 4) {
        const batch = db!.batch();
        for (const c of copies.slice(i, i + 4)) batch.set(templateRef.collection(c.collection).doc(c.id), c.data);
        await batch.commit();
    }
    await templateRef.set(template);
    console.log(`Written as a DRAFT (playable on a local server as is). Next: draw its art styles (draw-starter-style.ts)`);
    console.log(`and record its voices (record-starter-voices.ts). Publish with: --publish ${templateId}`);
}

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    if (flag('list')) return list();
    if (arg('publish')) return setStatus(arg('publish')!, 'live');
    if (arg('unpublish')) return setStatus(arg('unpublish')!, 'draft');
    if (arg('set-story')) {
        const storyFile = arg('story-file');
        if (!storyFile) throw new Error('--set-story needs --story-file <path>');
        const ref = db.collection(STARTER_GAMES_COLLECTION).doc(arg('set-story')!);
        if (!(await ref.get()).exists) throw new Error(`No starter template "${arg('set-story')}"`);
        const text = readFileSync(storyFile, 'utf8').trim();
        if (!text) throw new Error('The story file is empty');
        await ref.update({story: text});
        console.log(`${arg('set-story')}: opening story replaced (${text.length} chars). Record its voice again: record-starter-voices.ts ${arg('set-story')} --only story`);
        return;
    }
    const gameId = process.argv[2];
    if (!gameId || gameId.startsWith('--')) {
        console.error('Usage: snapshot-starter-game.ts <gameId> --id <templateId> --title "…" --hook "…" [--order N] [--dry-run]');
        process.exit(1);
    }
    return snapshot(gameId);
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message ?? error); process.exit(1); });
