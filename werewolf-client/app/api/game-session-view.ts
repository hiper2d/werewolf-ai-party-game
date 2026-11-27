import {createHmac, randomBytes} from 'crypto';
import {auth} from '@/auth';
import {Game} from '@/app/api/game-models';
import {GameViewer, viewGameAs} from '@/app/utils/game-view';

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
 * Whose seat an account holds. One human seat today, the owner's; a game from before
 * owners were stored belongs to whoever can open it. Anybody else has no seat.
 */
export function viewerOf(game: Game, email: string | null | undefined): GameViewer | null {
    if (!email || !game) return null;
    if (!game.ownerEmail || game.ownerEmail === email) return {name: game.humanPlayerName};
    return null;
}

// Without a configured secret the key lives as long as the process: a token then differs
// between server instances, which costs the page one extra "what is next" call, no more.
const nightSealKey = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || randomBytes(32).toString('hex');

/** The keyed hash behind the night token (see `NightSeal`): short, and not reversible without the key. */
function sealNightPosition(position: string): string {
    return createHmac('sha256', nightSealKey).update(position).digest('hex').slice(0, 16);
}
