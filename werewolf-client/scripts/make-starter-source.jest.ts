/**
 * Creates the SOURCE game of a starter template without a browser: the same server actions
 * the new-game form calls (preview, create, the welcome round), run as the owner account.
 * It runs under jest only because jest can stand in for the session (`@/auth`) and for
 * Next's `after()`; nothing else is mocked, so models, images and Firestore are real and
 * the game costs what a normal game costs to create.
 *
 *   STARTER_SOURCE=scripts/starter-sources/starship.json STARTER_OWNER=<email> \
 *     npx jest --watchman=false --runInBand --testMatch '**​/scripts/make-starter-source.jest.ts'
 *
 * The JSON holds the form's fields: {theme, description, name, artStyle?, gameMasterAiType?}.
 * The table is fixed: 8 players, 2 werewolves, Doctor + Detective, roleplay, Google voices.
 * It prints the game id; then snapshot-starter-game.ts <gameId> --id … turns it into a template.
 */
import {readFileSync} from 'fs';

const pending: Promise<unknown>[] = [];
jest.mock('@/auth', () => ({
    auth: jest.fn(async () => ({user: {email: process.env.STARTER_OWNER, name: 'Starter'}})),
    signIn: jest.fn(),
}));
jest.mock('next/server', () => ({
    ...jest.requireActual('next/server'),
    after: (task: () => Promise<unknown>) => { pending.push(Promise.resolve().then(task)); },
}));

import {createGame, getGame, previewGame} from '@/app/api/game-actions';
import {welcome} from '@/app/api/bot-actions';
import {GAME_MODES, GAME_ROLES, GAME_STATES, GamePreview} from '@/app/api/game-models';
import {LLM_CONSTANTS} from '@/app/ai/ai-models';
import {sanitizePlayerName} from '@/app/utils/name-utils';

it('creates the source game', async () => {
    const file = process.env.STARTER_SOURCE;
    if (!file || !process.env.STARTER_OWNER) throw new Error('Set STARTER_SOURCE (a JSON file) and STARTER_OWNER (the account)');
    const source = JSON.parse(readFileSync(file, 'utf8'));
    const form: GamePreview = {
        name: source.name ?? 'Kai',
        theme: source.theme,
        description: source.description,
        ...(source.artStyle ? {artStyle: source.artStyle} : {}),
        voiceProvider: 'google',
        playerCount: 8,
        werewolfCount: 2,
        specialRoles: [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE],
        humanPlayerRole: GAME_ROLES.VILLAGER,
        gameMasterAiType: source.gameMasterAiType ?? LLM_CONSTANTS.CLAUDE_OPUS,
        playersAiType: [LLM_CONSTANTS.RANDOM],
        longReplies: false,
        gameMode: GAME_MODES.ROLEPLAY,
        language: 'en',
    };
    const preview = await previewGame(form);
    console.log(`Cast: ${preview.bots.map(b => b.name).join(', ')}\nScene: ${preview.scene}`);
    const gameId = await createGame({
        ...preview,
        gameMasterThinking: false,
        bots: preview.bots.map(bot => ({...bot, name: sanitizePlayerName(bot.name) || bot.name})),
    });
    if (!gameId) throw new Error('createGame returned no id');
    console.log(`GAME ${gameId}`);

    // The welcome round: one introduction per call, as the game page does it.
    for (let turn = 0; turn < 30; turn++) {
        const game = await getGame(gameId);
        if (!game) throw new Error('The game disappeared');
        if (game.errorState) throw new Error(`Game error: ${JSON.stringify(game.errorState)}`);
        if (game.gameState !== GAME_STATES.WELCOME) break;
        await welcome(gameId);
    }
    // Portraits are drawn after the response in the app; here, wait for them.
    await Promise.all(pending);
    const game = await getGame(gameId);
    console.log(`DONE ${gameId}: ${game?.gameState}, day ${game?.currentDay}, portraits ${game?.avatarsStatus}`);
    expect(game?.gameState).toBe(GAME_STATES.DAY_DISCUSSION);
}, 30 * 60 * 1000);
