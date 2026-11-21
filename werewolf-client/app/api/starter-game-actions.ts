'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {auth} from "@/auth";
import {
    AVATAR_VARIANTS_COLLECTION,
    avatarVariantKey,
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
    isIllustrationDocId,
    isStarterTemplateVisible,
    parseStarterSceneDocId,
    pickStarterGameMaster,
    pickStarterPortraitRound,
    renameHumanAvatarKey,
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

/** The cards on the start screen: the live templates, in order. */
export async function listStarterGames(): Promise<StarterCard[]> {
    const templates = await loadVisibleTemplates();
    return templates.map(t => ({
        id: t.id,
        ...(t.status === 'live' ? {} : {draft: true}),
        title: t.title,
        hook: t.hook,
        playerCount: t.bots.length + 1,
        language: t.language,
    }));
}

/**
 * Creates a game from a starter template for the signed-in player and returns its id.
 *
 * No model and no image is called: the cast, the opening story, the introductions and the
 * portraits are copied from the template, and the game opens in day 1's discussion. What is
 * decided here, per game: the bots' roles (the human is always a villager) and their models
 * (one each from the cheapest group).
 *
 * Returns a result union instead of throwing: production masks the message of an error
 * thrown from a server action (see previewGameAction).
 */
export async function createStarterGame(templateId: string, playerName: string): Promise<StarterGameResult> {
    try {
        return { ok: true, gameId: await createStarterGameImpl(templateId, playerName) };
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

async function createStarterGameImpl(templateId: string, playerName: string): Promise<string> {
    const session = await auth();
    const ownerEmail = session?.user?.email;
    if (!ownerEmail) {
        throw new Error('Not authenticated');
    }
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
        helperMode: true,
        avatarsStatus: 'ready',
        avatarsVersion: template.avatarsVersion,
        avatarVariants: renameHumanAvatarKey(shownVariants, template.humanPlaceholder, humanPlayerName),
        avatarVersions: renameHumanAvatarKey(template.avatarVersions, template.humanPlaceholder, humanPlayerName),
        totalGameCost: 0,
        gameMasterTokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 },
    };

    // Portraits, their candidates, the kept sheets and the welcome scene: copied doc by doc,
    // the human's renamed from the placeholder to the player's name.
    const writes: PendingWrite[] = [];
    const [shownDocs, candidateDocs] = await Promise.all([
        templateRef.collection('avatars').get(),
        templateRef.collection(AVATAR_VARIANTS_COLLECTION).get(),
    ]);
    const candidates = new Map(candidateDocs.docs.map(doc => [doc.id, doc.data()]));
    const shown = new Map(shownDocs.docs.map(doc => [doc.id, doc.data()]));
    for (const doc of shownDocs.docs) {
        if (isIllustrationDocId(doc.id)) continue;
        // Per-style scenes (`scene-welcome__2`) stay in the template; the picked style's
        // pair is written under the plain scene keys below.
        const styleScene = parseStarterSceneDocId(doc.id);
        if (styleScene) continue;
        const ownScene = styleSet ? shown.get(starterSceneDocId(doc.id, portraitRound!)) : undefined;
        if (ownScene?.data) {
            writes.push({ref: gameRef.collection('avatars').doc(doc.id), data: ownScene});
            continue;
        }
        // games/{id}/avatars/{key} holds a copy of the SELECTED candidate (what every reader
        // serves), so a character's shown portrait comes from the picked round.
        const picked = portraitRound !== undefined && template.avatarVariants?.[doc.id]
            ? candidates.get(avatarVariantKey(doc.id, portraitRound))
            : undefined;
        const data = picked?.data
            ? {data: picked.data, mime: picked.mime || 'image/jpeg', createdAt: timestamp}
            : doc.data();
        const targetId = starterAvatarDocId(doc.id, template.humanPlaceholder, humanPlayerName);
        writes.push({ref: gameRef.collection('avatars').doc(targetId), data});
    }
    for (const doc of candidateDocs.docs) {
        const targetId = starterAvatarDocId(doc.id, template.humanPlaceholder, humanPlayerName);
        writes.push({ref: gameRef.collection(AVATAR_VARIANTS_COLLECTION).doc(targetId), data: doc.data()});
    }

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

    return gameId;
}
