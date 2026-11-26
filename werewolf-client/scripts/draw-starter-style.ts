import {db} from "../firebase/server";
import {SCENE_WELCOME_KEY} from "../app/api/game-models";
import {AvatarSubject, drawIllustrationSet, PendingWrite, SpendLedger, writeCandidates} from "../app/utils/avatar-generation";
import {
    commonPortraitRounds,
    parseStarterSceneDocId,
    pruneStyleSets,
    STARTER_GAMES_COLLECTION,
    starterSceneDocId,
    StarterStyleSet,
    StarterTemplate,
} from "../app/utils/starter-games";
import {sanitizeArtStyle} from "../app/utils/art-style";

/**
 * Draws one more art style for a starter template (docs/plan-growth-roadmap.md, track 1):
 * the whole cast's portraits and the scene pair (welcome + night), all in the given style.
 * A new game gets ONE of the template's styles at random, with its art-style text, so the
 * Game Master's live illustrations match it.
 *
 * A normal in-game redraw cannot do this on purpose: it copies the look of the game's
 * welcome scene, so every redraw comes out in the same style.
 *
 * Usage (from werewolf-client/, sandbox off):
 *   npx tsx --env-file=.env scripts/draw-starter-style.ts <templateId> --label anime \
 *       --style "90s cel-shaded anime, clean line art, flat vivid colors"
 *   npx tsx --env-file=.env scripts/draw-starter-style.ts <templateId> --list
 *   npx tsx --env-file=.env scripts/draw-starter-style.ts <templateId> --card <round>
 *
 * Each draw is two image calls (the portrait sheet and the scene pair), billed to the
 * platform Google key; the cost is printed. A template keeps the newest THREE rounds: a
 * fourth draw drops the oldest (the source game's own portraits are round 0, so three
 * styled draws replace them). `--card <round>` makes that style's welcome scene the card
 * picture on the start screen.
 */

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function loadTemplate(templateId: string) {
    const ref = db!.collection(STARTER_GAMES_COLLECTION).doc(templateId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error(`No starter template "${templateId}"`);
    return {ref, template: {...(doc.data() as Omit<StarterTemplate, 'id'>), id: doc.id}};
}

function printStyles(template: StarterTemplate) {
    const window = commonPortraitRounds(template.avatarVariants);
    console.log(`${template.id}: portrait rounds ${window ? `${window.from}..${window.to - 1}` : '(none)'}`);
    for (let round = window?.from ?? 0; round < (window?.to ?? 0); round++) {
        const set = template.styleSets?.[String(round)];
        console.log(`  round ${round}: ${set ? `${set.label} — "${set.artStyle}"` : '(unstyled: from the source game; never picked while a styled round exists)'}`);
    }
}

async function setCard(templateId: string, round: number) {
    const {ref} = await loadTemplate(templateId);
    const scene = await ref.collection('avatars').doc(starterSceneDocId(SCENE_WELCOME_KEY, round)).get();
    if (!scene.exists || !scene.data()?.data) throw new Error(`Round ${round} has no welcome scene`);
    await ref.collection('avatars').doc(SCENE_WELCOME_KEY).set(scene.data()!);
    console.log(`${templateId}: the card now shows round ${round}'s welcome scene`);
}

async function draw(templateId: string) {
    const label = arg('label');
    const artStyle = sanitizeArtStyle(arg('style'));
    if (!label || !artStyle) throw new Error('--label and --style are required');

    const {ref, template} = await loadTemplate(templateId);
    const keys = (await db!.collection('config').doc('freeTierApiKeys').get()).data() ?? {};
    const apiKey = keys.keys?.GOOGLE_API_KEY ?? keys['keys.GOOGLE_API_KEY'] ?? keys.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('No Google API key in config/freeTierApiKeys');

    const subject: AvatarSubject = {
        theme: template.theme,
        description: template.description,
        artStyle,
        humanPlayerName: template.humanPlaceholder,
        bots: template.bots,
    };

    console.log(`Drawing "${label}" for ${templateId}: ${artStyle}`);
    const ledger: SpendLedger = {spentUSD: 0};
    const drawn = await drawIllustrationSet(apiKey, subject, {
        withScenes: true,
        ledger,
        logContext: {starterTemplate: templateId, style: label},
        onStage: async stage => console.log(`  ${stage} drawn`),
    });
    if (drawn.scenes.length < 2) {
        throw new Error(`The scene pair did not come back (cost so far $${ledger.spentUSD.toFixed(3)}); nothing stored. Run again.`);
    }

    // The round this draw lands on: the next candidate index of the cast.
    const round = Math.max(...Object.values(template.avatarVariants ?? {}).map(v => v.n), 0);
    const now = Date.now();
    const sceneWrites: PendingWrite[] = drawn.scenes.map(scene => ({
        ref: ref.collection('avatars').doc(starterSceneDocId(scene.key, round)),
        data: {data: scene.jpeg.toString('base64'), mime: 'image/jpeg', createdAt: now},
    }));
    // The first style also becomes the card picture and the default scene pair.
    const firstStyle = Object.keys(template.styleSets ?? {}).length === 0;
    if (firstStyle) {
        for (const scene of drawn.scenes) {
            sceneWrites.push({ref: ref.collection('avatars').doc(scene.key), data: {data: scene.jpeg.toString('base64'), mime: 'image/jpeg', createdAt: now}});
        }
    }

    const {variants, versions} = await writeCandidates(ref, drawn.portraits, template.avatarVariants ?? {}, sceneWrites, {}, drawn.sheet);
    const styleSets: Record<string, StarterStyleSet> = pruneStyleSets({...(template.styleSets ?? {}), [String(round)]: {label, artStyle}}, variants);

    // Scene pairs of rounds that aged out of the candidate window go with them.
    const sceneDocs = await ref.collection('avatars').listDocuments();
    for (const doc of sceneDocs) {
        const parsed = parseStarterSceneDocId(doc.id);
        if (parsed && !styleSets[String(parsed.round)]) await doc.delete();
    }

    await ref.update({
        avatarVariants: variants,
        avatarVersions: {...(template.avatarVersions ?? {}), ...versions},
        avatarsVersion: now,
        styleSets,
    });

    const missing = [...template.bots.map(b => b.name), template.humanPlaceholder].filter(key => (variants[key]?.n ?? 0) <= round);
    if (missing.length > 0) console.warn(`  WARNING: no portrait came back for ${missing.join(', ')}; draw this style again.`);
    console.log(`Stored as round ${round}. Cost $${ledger.spentUSD.toFixed(3)}.`);
    printStyles({...template, avatarVariants: variants, styleSets});
}

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const templateId = process.argv[2];
    if (!templateId || templateId.startsWith('--')) {
        console.error('Usage: draw-starter-style.ts <templateId> --label <name> --style "<art direction>" | --list | --card <round>');
        process.exit(1);
    }
    if (flag('list')) return printStyles((await loadTemplate(templateId)).template);
    if (arg('card') !== undefined) return setCard(templateId, Number(arg('card')));
    return draw(templateId);
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message ?? error); process.exit(1); });
