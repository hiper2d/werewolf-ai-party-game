import {createHmac, randomBytes} from 'crypto';
import {auth} from '@/auth';
import {Game, GameActionResponse, GameMessage} from '@/app/api/game-models';
import {GameViewer, viewGameAs, viewMessagesAs} from '@/app/utils/game-view';
import {bumpGamePulse} from '@/app/api/game-pulse';

/**
 * The game as the signed-in player's browser may see it (rules in app/utils/game-view.ts).
 * EVERY path that hands a game to a browser ends here: the game page's first render,
 * `getGameForPlayer`, the action wrapper and the few actions that return a game outside it.
 * Server code keeps working on the full game and cuts the view at the last step.
 *
 * NOT a 'use server' file: it takes a whole game from its caller, which a browser must
 * never be able to supply.
 */
export async function gameForSession(game: Game): Promise<Game> {
    const session = await auth();
    return viewGameAs(game, viewerOf(game, session?.user?.email), sealNightPosition);
}

/**
 * For an action that has just CHANGED the game: stamps the game's pulse (app/api/game-pulse.ts),
 * so every other screen showing this game asks for its view again, and returns the caller's
 * view carrying that stamp, so the caller's own page knows the change was its own.
 */
export async function changedGameForSession(game: Game): Promise<Game> {
    const [pulse, view] = await Promise.all([bumpGamePulse(game), gameForSession(game)]);
    return pulse ? {...view, pulse} : view;
}

/**
 * The messages of a game as the session's player may read them. `game` must be the FULL
 * game (from `getGame`), never a view: the private channel is chosen by the real role.
 */
export async function messagesForSession(game: Game, messages: GameMessage[]): Promise<GameMessage[]> {
    const session = await auth();
    return viewMessagesAs(game, viewerOf(game, session?.user?.email), messages);
}

/**
 * An action's whole answer, cut for the session's player, with the game's pulse stamped
 * (an action's answer means the game may have changed). `response.game` is the full game.
 */
export async function responseForSession(response: GameActionResponse): Promise<GameActionResponse> {
    // The stub of a deleted game (or a failed action's fallback) has no cast to judge by.
    if (!response?.game || !Array.isArray(response.game.bots)) return response;
    const [pulse, session] = await Promise.all([bumpGamePulse(response.game), auth()]);
    const viewer = viewerOf(response.game, session?.user?.email);
    return {
        ...response,
        game: {...viewGameAs(response.game, viewer, sealNightPosition), ...(pulse ? {pulse} : {})},
        messages: viewMessagesAs(response.game, viewer, response.messages),
    };
}

/**
 * Whose seat an account holds. One human seat today, the owner's, who is also the host; a game from before
 * owners were stored belongs to whoever can open it. Anybody else has no seat.
 */
export function viewerOf(game: Game, email: string | null | undefined): GameViewer | null {
    if (!email || !game) return null;
    if (!game.ownerEmail || game.ownerEmail === email) return {name: game.humanPlayerName, host: true};
    return null;
}

// Without a configured secret the key lives as long as the process: a token then differs
// between server instances, which costs the page one extra "what is next" call, no more.
const nightSealKey = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || randomBytes(32).toString('hex');

/** The keyed hash behind the night token (see `NightSeal`): short, and not reversible without the key. */
function sealNightPosition(position: string): string {
    return createHmac('sha256', nightSealKey).update(position).digest('hex').slice(0, 16);
}
