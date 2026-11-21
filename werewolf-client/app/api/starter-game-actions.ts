'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {after} from "next/server";
import {auth, signIn} from "@/auth";
import {findGuest, readGuestCookie, resolveGuestForRequest} from "@/app/api/guest-accounts";
import {GUEST_ONE_GAME_MESSAGE, GUEST_PROVIDER_ID, guestWallReached, isGuestEmail} from "@/app/utils/guest";
import {
    AVATAR_GM_KEY,
    AVATAR_VARIANTS_COLLECTION,
    avatarVariantKey,
    isAvatarSheetKey,
    SCENE_NIGHT_KEY,
    SCENE_WELCOME_KEY,
    AvatarVariantEntry,
    Bot,
    Game,
    GAME_MASTER,
    GAME_ROLES,
    GAME_STATES,
    GameMessage,
    MessageType,
    RECIPIENT_ALL,
    USER_TIERS,
} from "@/app/api/game-models";
import {
    dealStarterModels,
    dealStarterRoles,
    isStarterTemplateVisible,
    pickStarterGameMaster,
    pickStarterPortraitRound,
    renameHumanAvatarKey,
    guestStarterGame,
    resumableStarterGames,
    replacePlaceholderName,
    STARTER_GAMES_COLLECTION,
    StarterCard,
    starterAvatarDocId,
    starterSceneDocId,
    StarterTemplate,
} from "@/app/utils/starter-games";
import {getStarterGameMasterModels, getStarterModels} from "@/app/ai/model-limit-utils";
import {getUserTierAndApiKeys} from "@/app/utils/tier-utils";
import {assertFreeSpendWithinLimit, getUserBalance} from "@/app/api/user-actions";
import {getFreeTierLimits} from "@/app/api/limits-actions";
import {insufficientBalanceMessage, isFreeSpendLimitError, isInsufficientBalanceError} from "@/app/api/errors";
import {duplicateNameErrors, sanitizePlayerName, validatePlayerName} from "@/app/utils/name-utils";
import {clampUserText, INPUT_LIMITS} from "@/app/utils/input-limits";
import {screenHumanInput} from "@/app/api/jev-screen";
import {buildBotTurnTail} from "@/app/utils/bot-utils";
import {format} from "@/app/ai/prompts/utils";
import {GM_COMMAND_INTRODUCE_YOURSELF} from "@/app/ai/prompts/gm-commands";
import {messageDocId, serializeMessageForFirestore} from "@/app/api/message-serialization";
import {commitChunked, PendingWrite} from "@/app/utils/avatar-generation";
import {recordFeatureEvent} from "@/app/api/feature-events";
import {normalizeGameLanguage} from "@/app/ai/game-language";
import {DEFAULT_GAME_MODE} from "@/app/api/game-models";
import {logger} from "@/app/utils/logger";

export type StarterGameResult = { ok: true; gameId: string } | { ok: false; error: string };

const GAME_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function loadVisibleTemplates(): Promise<StarterTemplate[]> {
    if (!db) throw new Error('Firestore is not initialized');
    // A handful of documents: read them all and filter here (drafts show outside production).
    const snapshot = await db.collection(STARTER_GAMES_COLLECTION).get();
    return snapshot.docs
        .map(doc => ({...(doc.data() as Omit<StarterTemplate, 'id'>), id: doc.id}))
        .filter(template => isStarterTemplateVisible(template.status, IS_PRODUCTION))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Who is looking: the signed-in account, the guest of this session, or the guest this
 * browser's cookie names when its session has expired. Undefined for a first-time visitor.
 */
async function viewerEmail(): Promise<string | undefined> {
    const email = (await auth())?.user?.email;
    if (email) return email;
    return (await findGuest(await readGuestCookie()))?.email;
}

/**
 * The cards on the start screen: the live templates, in order, with what this viewer can do
 * on each. An account continues its unfinished game from a story or starts a new one. A
 * guest has one game: its card continues it (or asks for a sign-in once it reached day 2),
 * the other stories are locked behind a sign-in.
 */
export async function listStarterGames(): Promise<StarterCard[]> {
    const templates = await loadVisibleTemplates();
    // Best effort: a failed read just offers a new game.
    let resumable: Record<string, string> = {};
    let guestGame: {id: string; starterTemplateId?: string; currentDay?: number} | undefined;
    let isGuest = false;
    try {
        const email = await viewerEmail();
        if (email && db && templates.length > 0) {
            const games = (await db.collection('games').where('ownerEmail', '==', email).select('starterTemplateId', 'gameState', 'createdAt', 'currentDay').get())
                .docs.map(doc => ({id: doc.id, ...(doc.data() as {starterTemplateId?: string; gameState?: string; createdAt?: number; currentDay?: number})}));
            isGuest = isGuestEmail(email);
            if (isGuest) {
                guestGame = guestStarterGame(games);
            } else {
                resumable = resumableStarterGames(games);
            }
        }
    } catch { /* offer a new game */ }
    return templates.map(t => {
        const isGuestCard = guestGame?.starterTemplateId === t.id;
        return {
            id: t.id,
            ...(resumable[t.id] ? {resumeGameId: resumable[t.id]} : {}),
            ...(isGuestCard ? {resumeGameId: guestGame!.id, ...(guestWallReached(guestGame!) ? {walled: true} : {})} : {}),
            ...(guestGame && !isGuestCard ? {locked: true} : {}),
            ...(t.status === 'live' ? {} : {draft: true}),
            title: t.title,
            hook: t.hook,
            playerCount: t.bots.length + 1,
            language: t.language,
        };
    });
}

/**
 * Creates a game from a starter template for the signed-in player and returns its id — or
 * the id of the unfinished game they already have from that template, unless `forceNew`.
 *
 * No model and no image is called: the cast, the opening story, the introductions and the
 * portraits are copied from the template, and the game opens in day 1's discussion. What is
 * decided here, per game: the bots' roles (the human is always a villager) and their models
 * (one each from the cheapest group).
 *
 * Returns a result union instead of throwing: production masks the message of an error
 * thrown from a server action (see previewGameAction).
 */
export async function createStarterGame(templateId: string, playerName: string, options: { forceNew?: boolean } = {}): Promise<StarterGameResult> {
    try {
        return { ok: true, gameId: await createStarterGameImpl(templateId, playerName, options.forceNew === true) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const playerWall = isInsufficientBalanceError(message) || isFreeSpendLimitError(message);
        logger[playerWall ? 'warn' : 'error'](`Starter game ${playerWall ? 'refused' : 'failed'}: ${message}`, {
            function: 'createStarterGame',
            templateId,
            error: message,
            details: error instanceof Error ? error.stack : undefined,
        });
        return { ok: false, error: message };
    } finally {
        try {
            await logger.flush();
        } catch { /* logging must never fail the action */ }
    }
}

/**
 * Who the game is for. A visitor with no session becomes a guest here (app/utils/guest.ts):
 * the account is found by the browser's cookie or minted, and the session is started in the
 * same request, so one click on a story card is the whole sign-up.
 */
async function resolveStarterOwner(): Promise<string> {
    const email = (await auth())?.user?.email;
    if (email) {
        return email;
    }
    const guest = await resolveGuestForRequest();
    await signIn(GUEST_PROVIDER_ID, { guestId: guest.id, redirect: false });
    return guest.email;
}

async function createStarterGameImpl(templateId: string, playerName: string, forceNew: boolean): Promise<string> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // The template id reaches a document path: accept only the shape the snapshot script writes.
    if (typeof templateId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(templateId)) {
        throw new Error('Unknown starter game.');
    }
    const templateRef = db.collection(STARTER_GAMES_COLLECTION).doc(templateId);
    const templateDoc = await templateRef.get();
    const template = templateDoc.exists ? {...(templateDoc.data() as Omit<StarterTemplate, 'id'>), id: templateDoc.id} : null;
    if (!template || !isStarterTemplateVisible(template.status, IS_PRODUCTION)) {
        throw new Error('Unknown starter game.');
    }

    // Resolved only once the template is known to exist, so a bad request mints no guest.
    const ownerEmail = await resolveStarterOwner();
    const isGuest = isGuestEmail(ownerEmail);

    // A guest has ONE game. Pressing its card again (or a card restored by the Back button)
    // opens it; another story needs a sign-in. There is no second deal for a guest.
    if (isGuest) {
        const own = await db.collection('games').where('ownerEmail', '==', ownerEmail).select('starterTemplateId', 'createdAt').get();
        const existing = guestStarterGame(own.docs.map(doc => ({id: doc.id, ...(doc.data() as {starterTemplateId?: string; createdAt?: number})})));
        if (existing) {
            if (existing.starterTemplateId !== templateId) {
                throw new Error(GUEST_ONE_GAME_MESSAGE);
            }
            return existing.id;
        }
    }

    // A player who already has this story on the table gets that game back, whatever the
    // page they clicked on believed (a card restored by the Back button still says "Play").
    // Only an explicit "new game" deals a second one.
    if (!forceNew && !isGuest) {
        const own = await db.collection('games').where('ownerEmail', '==', ownerEmail).select('starterTemplateId', 'gameState', 'createdAt').get();
        const existing = resumableStarterGames(own.docs.map(doc => ({id: doc.id, ...(doc.data() as {starterTemplateId?: string; gameState?: string; createdAt?: number})})))[templateId];
        if (existing) {
            return existing;
        }
    }

    // The player's name: the only text typed for a starter game.
    const typedName = clampUserText(playerName, INPUT_LIMITS.playerName);
    const nameError = validatePlayerName(typedName);
    if (nameError) {
        throw new Error(nameError);
    }
    const humanPlayerName = sanitizePlayerName(typedName);
    const duplicates = Object.values(duplicateNameErrors(humanPlayerName, template.bots.map(b => b.name)));
    if (duplicates.length > 0) {
        throw new Error(`That name is taken by a character in this story. Pick another one.`);
    }

    // The same walls a game made with the form meets, before anything is written.
    const { tier, apiKeys } = await getUserTierAndApiKeys(ownerEmail);
    if (tier === USER_TIERS.PAID) {
        if (await getUserBalance(ownerEmail) <= 0) {
            throw new Error(insufficientBalanceMessage('a new game'));
        }
    } else {
        const limits = await getFreeTierLimits();
        const startOfTodayUTC = new Date();
        startOfTodayUTC.setUTCHours(0, 0, 0, 0);
        const todaysGames = await db.collection('games')
            .where('ownerEmail', '==', ownerEmail)
            .where('createdAt', '>=', startOfTodayUTC.getTime())
            .get();
        if (todaysGames.size >= limits.gamesPerDay) {
            throw new Error(
                `Free tier limit reached: you can create up to ${limits.gamesPerDay} games per day. Please try again tomorrow or add funds on your profile page.`
            );
        }
        await assertFreeSpendWithinLimit(ownerEmail);
    }

    const screen = await screenHumanInput({
        source: 'preview',
        text: `Player name: ${humanPlayerName}`,
        userEmail: ownerEmail,
        apiKeys,
    });
    if (screen.blocked) {
        throw new Error(screen.message);
    }

    // Dealt per game: roles and models. The template fixes neither.
    const botRoles = dealStarterRoles(template.bots.length, template.werewolfCount, template.specialRoles);
    const botModels = dealStarterModels(template.bots.length, getStarterModels());
    const gameMasterAiType = pickStarterGameMaster(template.gameMasterAiType, getStarterGameMasterModels());

    const withName = (text: string) => replacePlaceholderName(text, template.humanPlaceholder, humanPlayerName);

    const bots: Bot[] = template.bots.map((bot, index) => ({
        name: bot.name,
        story: withName(bot.story),
        role: botRoles[index],
        isAlive: true,
        aiType: botModels[index],
        gender: bot.gender,
        voice: bot.voice,
        ...(bot.voiceStyle ? {voiceStyle: bot.voiceStyle} : {}),
        playStyle: bot.playStyle,
        ...(bot.visualDescription?.trim() ? {visualDescription: bot.visualDescription.trim()} : {}),
    }));

    const timestamp = Date.now();
    const expireAt = firestore.Timestamp.fromMillis(timestamp + GAME_TTL_MS);
    const gameId = `${templateId}-${timestamp}`;
    const gameRef = db.collection('games').doc(gameId);

    // One of the template's portrait sets, at random, for the whole cast (one draw round =
    // one drawing style). The other sets stay on each character card as alternatives.
    const portraitRound = pickStarterPortraitRound(template.avatarVariants, Math.random, template.styleSets);
    // A styled round brings its own art direction (the GM's live illustrations follow it)
    // and its own scene pair.
    const styleSet = portraitRound === undefined ? undefined : template.styleSets?.[String(portraitRound)];
    const artStyle = styleSet?.artStyle ?? template.artStyle;
    const shownVariants: Record<string, AvatarVariantEntry> = {};
    for (const [key, entry] of Object.entries(template.avatarVariants ?? {})) {
        shownVariants[key] = portraitRound === undefined ? entry : {...entry, sel: portraitRound};
    }

    // The introductions are already in the chat, so every bot has spoken once today.
    const dayActivityCounter: Record<string, number> = {};
    for (const bot of bots) dayActivityCounter[bot.name] = 1;

    // The opening story, then per bot the GM's "introduce yourself" command and the intro.
    const messageCount = 1 + bots.length * 2;

    // Mirrors the document createGame writes (app/api/game-actions.ts): a starter game is an
    // ordinary game from here on. Differences: it starts past WELCOME, its portraits are
    // already there, and it carries starterTemplateId + helperMode.
    const game: Omit<Game, 'id'> & { expireAt: firestore.Timestamp } = {
        description: template.description,
        theme: template.theme,
        ...(artStyle ? {artStyle} : {}),
        werewolfCount: template.werewolfCount,
        specialRoles: template.specialRoles,
        longReplies: template.longReplies ?? false,
        gameMode: template.gameMode ?? DEFAULT_GAME_MODE,
        language: normalizeGameLanguage(template.language),
        gameMasterAiType,
        ...(template.voiceProvider ? {voiceProvider: template.voiceProvider} : {}),
        gameMasterVoice: template.gameMasterVoice,
        ...(template.gameMasterVoiceStyle ? {gameMasterVoiceStyle: template.gameMasterVoiceStyle} : {}),
        story: withName(template.story),
        bots,
        humanPlayerName,
        humanPlayerRole: GAME_ROLES.VILLAGER,
        humanPlayerIsAlive: true,
        currentDay: 1,
        gameState: GAME_STATES.DAY_DISCUSSION,
        gameStateParamQueue: [],
        gameStateProcessQueue: [],
        messageCounter: messageCount,
        dayActivityCounter,
        ownerEmail,
        createdAt: timestamp,
        expireAt,
        createdWithTier: tier,
        starterTemplateId: templateId,
        ...(template.clips && Object.keys(template.clips).length > 0 ? {starterClips: template.clips} : {}),
        helperMode: true,
        avatarsStatus: 'ready',
        avatarsVersion: template.avatarsVersion,
        avatarVariants: renameHumanAvatarKey(shownVariants, template.humanPlaceholder, humanPlayerName),
        avatarVersions: renameHumanAvatarKey(template.avatarVersions, template.humanPlaceholder, humanPlayerName),
        totalGameCost: 0,
        gameMasterTokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 },
    };

    // Images. Only what the first screen shows is copied before the player gets the game:
    // one portrait per character (the picked round's) and the scene pair, about a dozen
    // small docs. The other candidates and the kept sheets (several MB: what the character
    // card's "other portrait" arrows and the reframe tool read) follow in the background,
    // after the response. Copying everything up front made Play take twelve seconds.
    const avatarsCol = templateRef.collection('avatars');
    const candidatesCol = templateRef.collection(AVATAR_VARIANTS_COLLECTION);
    const portraitKeys = [...new Set([...Object.keys(template.avatarVariants ?? {}), ...template.bots.map(b => b.name), template.humanPlaceholder, AVATAR_GM_KEY])];
    const sceneKeys = [SCENE_WELCOME_KEY, SCENE_NIGHT_KEY];
    const readImages = async (refs: firestore.DocumentReference[]) =>
        refs.length === 0 ? [] : (await db!.getAll(...refs)).map(snap => (snap.data()?.data ? snap.data()! : undefined));

    // First choice: the picked round's candidate and the picked style's scenes.
    const firstChoice = await readImages([
        ...portraitKeys.map(key => portraitRound !== undefined && template.avatarVariants?.[key]
            ? candidatesCol.doc(avatarVariantKey(key, portraitRound))
            : avatarsCol.doc(key)),
        ...sceneKeys.map(key => styleSet ? avatarsCol.doc(starterSceneDocId(key, portraitRound!)) : avatarsCol.doc(key)),
    ]);
    // Fallback for anything missing: what the template itself shows under the plain key.
    const allKeys = [...portraitKeys, ...sceneKeys];
    const missing = allKeys.filter((_, index) => !firstChoice[index]);
    const fallback = new Map((await readImages(missing.map(key => avatarsCol.doc(key)))).map((data, index) => [missing[index], data]));

    const writes: PendingWrite[] = [];
    allKeys.forEach((key, index) => {
        const image = firstChoice[index] ?? fallback.get(key);
        if (!image) return; // no such picture in the template: the UI falls back to the preset sketch
        const targetId = starterAvatarDocId(key, template.humanPlaceholder, humanPlayerName);
        writes.push({ref: gameRef.collection('avatars').doc(targetId), data: {data: image.data, mime: image.mime || 'image/jpeg', createdAt: timestamp}});
    });

    const copyRemainingImages = async () => {
        const [candidateDocs, shownDocs] = await Promise.all([candidatesCol.get(), avatarsCol.get()]);
        const rest: PendingWrite[] = [];
        for (const doc of candidateDocs.docs) {
            const targetId = starterAvatarDocId(doc.id, template.humanPlaceholder, humanPlayerName);
            rest.push({ref: gameRef.collection(AVATAR_VARIANTS_COLLECTION).doc(targetId), data: doc.data()});
        }
        for (const doc of shownDocs.docs) {
            if (isAvatarSheetKey(doc.id)) rest.push({ref: gameRef.collection('avatars').doc(doc.id), data: doc.data()});
        }
        await commitChunked(rest);
    };

    // Messages get consecutive ids and strictly increasing timestamps (the chat sorts on them).
    const messages: GameMessage[] = [{
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: GAME_MASTER,
        msg: { story: game.story },
        messageType: MessageType.GAME_STORY,
        day: 1,
        timestamp: null,
        cost: 0,
    }];
    const gameForTails = {...game, id: gameId} as Game;
    for (let index = 0; index < bots.length; index++) {
        const bot = bots[index];
        messages.push({
            id: null,
            recipientName: bot.name,
            authorName: GAME_MASTER,
            msg: format(GM_COMMAND_INTRODUCE_YOURSELF, { bot_name: bot.name }),
            messageType: MessageType.GM_COMMAND,
            day: 1,
            timestamp: null,
            // Built for THIS game (its roles, its human's name), as the live welcome turn
            // would have: the bot's next call replays it as the end of this command's block.
            turnTail: buildBotTurnTail(bot, gameForTails, 'table'),
        });
        messages.push({
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: bot.name,
            // The introduction's text only. The source bot's private thinking is not copied:
            // it was written under another role deal.
            msg: { reply: withName(template.bots[index].intro), thinking: "" },
            messageType: MessageType.BOT_WELCOME,
            day: 1,
            timestamp: null,
            cost: 0,
        });
    }

    // Avatars first, the game doc last: a game that exists is a game that is complete.
    await commitChunked(writes);
    const batch = db.batch();
    messages.forEach((message, index) => {
        const counter = index + 1;
        const ref = gameRef.collection('messages').doc(messageDocId(counter, message.authorName, message.recipientName));
        batch.set(ref, {
            ...serializeMessageForFirestore(message),
            timestamp: timestamp + index,
            expireAt,
        });
    });
    batch.set(gameRef, game);
    await batch.commit();

    logger.info(`Starter game created: ${gameId}`, { templateId, owner: ownerEmail, language: game.language });
    await recordFeatureEvent({
        userId: ownerEmail,
        feature: 'starter_game_created',
        gameId,
        detail: {
            templateId,
            ...(styleSet ? {style: styleSet.label} : {}),
            tier,
            players: bots.length + 1,
            language: game.language ?? 'en',
            gameMaster: gameMasterAiType,
        },
    });

    // The rest of the images, off the request. Outside a request scope (scripts, tests)
    // there is no `after`: copy inline.
    const copyLogged = () => copyRemainingImages().catch(error =>
        logger.error(`Starter game ${gameId}: copying the remaining portraits failed`, {templateId, error: error?.message}));
    try {
        after(copyLogged);
    } catch {
        await copyLogged();
    }

    return gameId;
}
