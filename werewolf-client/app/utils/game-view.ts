import {Bot, Game, GAME_ROLES, GAME_STATES, ROLE_CONFIGS} from '@/app/api/game-models';
import {checkGameEndConditions} from '@/app/utils/game-utils';

/**
 * What one player's browser may know about a game (docs/plan-multiplayer.md, "strict per-seat
 * privacy"). The game doc holds every secret: who is a werewolf, each bot's private notes,
 * what the detective found. Until 2026-11-27 the whole doc went to the browser and the page
 * chose what to draw, which is fine for one player looking at their own game and wrong the
 * moment a second person sits at the table. `viewGameAs` is the ONE place that decides what
 * leaves the server; every path that hands a game to a browser goes through it
 * (`gameForSession` in app/api/game-view-actions.ts).
 *
 * Pure: no session, no database. The result is still a `Game`, with secrets blanked rather
 * than a second type, so the page's components keep their props.
 */

/** A role the viewer may not know. Empty so `ROLE_CONFIGS[role]` and truthiness both read "none". */
export const HIDDEN_ROLE = '';

/** Who is looking. `null` is somebody with no seat at the table: they learn no role at all. */
export interface GameViewer {
    name: string;
}

const isOver = (game: Game) =>
    game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;

/** The viewer's own role; null for somebody without a seat. One human seat today. */
function roleOf(game: Game, viewer: GameViewer | null): string | null {
    if (!viewer) return null;
    return viewer.name === game.humanPlayerName ? game.humanPlayerRole : null;
}

/**
 * May the viewer know this bot's role? The rules of the table: the dead are revealed,
 * werewolves know each other, and everything is open once the game is over.
 */
export function mayKnowRole(game: Game, viewer: GameViewer | null, bot: Bot): boolean {
    if (isOver(game) || !bot.isAlive) return true;
    return roleOf(game, viewer) === GAME_ROLES.WEREWOLF && bot.role === GAME_ROLES.WEREWOLF;
}

/** The bot as the viewer may see it: no private notes ever, the role only when known. */
function viewBot(game: Game, viewer: GameViewer | null, bot: Bot): Bot {
    // The bot's own notes and role knowledge are written in the first person ("as the
    // doctor I…"), so they give the role away on their own. No screen shows them.
    const {personalSummaries, summary, daySummaries, roleKnowledge, ...shown} = bot;
    void personalSummaries; void summary; void daySummaries; void roleKnowledge;
    return mayKnowRole(game, viewer, bot) ? shown : {...shown, role: HIDDEN_ROLE};
}

/**
 * Has the game been decided while the result screen is still up? The vote result and the
 * night result are shown before the game moves to GAME_OVER, and the page offers "end the
 * game" there. Counting sides needs every role, so the server answers it.
 */
export function pendingGameOver(game: Game): {reason?: string} | null {
    if (game.gameState === GAME_STATES.VOTE_RESULTS) {
        const end = checkGameEndConditions(game);
        return end.isEnded ? {reason: end.reason} : null;
    }
    if (game.gameState === GAME_STATES.NIGHT_RESULTS && game.resolvedNightState) {
        // The night's deaths are resolved but not applied to the cast yet.
        const dead = new Set((game.resolvedNightState.deaths || []).map(d => d.player));
        let bots = game.bots.map(bot => dead.has(bot.name) ? {...bot, isAlive: false} : bot);
        if (dead.has(game.humanPlayerName)) {
            // The end checker reads a dead human as an entry in the cast.
            bots = [...bots, {name: game.humanPlayerName, role: game.humanPlayerRole, isAlive: false} as Bot];
        }
        const end = checkGameEndConditions({...game, bots});
        return end.isEnded ? {reason: end.reason} : null;
    }
    return null;
}

/** How many roles act tonight: a count for the progress bar, never which ones. */
export function nightRoleTotal(game: Game): number {
    const roles = new Set<string>();
    game.bots.filter(b => b.isAlive).forEach(b => roles.add(b.role));
    roles.add(game.humanPlayerRole);
    // The same set the night queue is built from (night-actions.ts): villagers have a
    // role entry but no night action.
    return [...roles].filter(role => ROLE_CONFIGS[role]?.hasNightAction).length;
}

/**
 * Turns a description of the night's position into a token that changes whenever the
 * position does and says nothing about it. Supplied by the caller (a keyed hash on the
 * server): a plain hash could be reversed by trying the few possible queues.
 */
export type NightSeal = (position: string) => string;

/**
 * The night's two queues as the viewer may see them. On the server the process queue is
 * the roles still to act, in order, and the param queue the players of the role acting
 * now: together they say which roles are alive and who holds them. The page needs only
 * three things: is it my turn, how far along is the night, and "something changed, ask
 * the server for the next step".
 *  - The viewer's own role is acting: the head and its players are shown (a werewolf sees
 *    the pack's order, which the pack chat needs; any other role is one player).
 *  - Otherwise: every role is blank and the param queue is one sealed token, so the
 *    page sees the queues change without learning what they hold.
 * The lengths stay true: the progress bar counts roles done out of `nightRoleTotal`.
 */
function viewNightQueues(game: Game, viewer: GameViewer | null, seal: NightSeal): Pick<Game, 'gameStateProcessQueue' | 'gameStateParamQueue'> {
    const roles = game.gameStateProcessQueue || [];
    const players = game.gameStateParamQueue || [];
    if (game.gameState !== GAME_STATES.NIGHT || roles.length === 0) {
        return {gameStateProcessQueue: roles, gameStateParamQueue: players};
    }
    const ownRole = roleOf(game, viewer);
    if (ownRole && roles[0] === ownRole) {
        return {
            gameStateProcessQueue: [ownRole, ...roles.slice(1).map(() => HIDDEN_ROLE)],
            gameStateParamQueue: players,
        };
    }
    return {
        gameStateProcessQueue: roles.map(() => HIDDEN_ROLE),
        // '#' cannot be in a player's name, so the token is never taken for one.
        gameStateParamQueue: ['#' + seal(JSON.stringify([game.id, game.currentDay, roles, players]))],
    };
}

/**
 * What the night has done so far, cut to the viewer's own role: tonight's choices and the
 * resolved outcome stay on the server (the story tells the outcome), last night's choice
 * and the one-time abilities are kept for the viewer's own role only, where the night
 * action form reads them ("not the same target again", "the kill is used up").
 */
function viewNightRecords(game: Game, viewer: GameViewer | null): Pick<Game, 'nightResults' | 'previousNightResults' | 'resolvedNightState' | 'oneTimeAbilitiesUsed'> {
    const ownRole = roleOf(game, viewer);
    const previous = ownRole ? game.previousNightResults?.[ownRole] : undefined;
    const used = game.oneTimeAbilitiesUsed || {};
    return {
        nightResults: {},
        previousNightResults: ownRole && previous ? {[ownRole]: previous} : {},
        resolvedNightState: null,
        oneTimeAbilitiesUsed: {
            ...(ownRole === GAME_ROLES.DOCTOR && used.doctorKill ? {doctorKill: true} : {}),
            ...(ownRole === GAME_ROLES.DETECTIVE && used.detectiveKill ? {detectiveKill: true} : {}),
        },
    };
}

export function viewGameAs(game: Game, viewer: GameViewer | null, seal: NightSeal): Game {
    // A stub (the game was deleted mid-action) has nothing to hide and nothing to count.
    if (!game || !Array.isArray(game.bots)) return game;
    // A view has blanks where roles were: cutting it again would count sides wrongly.
    if (game.isView) return game;
    const ownRole = roleOf(game, viewer);
    return {
        ...game,
        isView: true,
        bots: game.bots.map(bot => viewBot(game, viewer, bot)),
        humanPlayerRole: ownRole ?? (isOver(game) ? game.humanPlayerRole : HIDDEN_ROLE),
        ...viewNightQueues(game, viewer, seal),
        ...viewNightRecords(game, viewer),
        pendingGameOver: pendingGameOver(game),
        nightRoleTotal: nightRoleTotal(game),
    };
}
