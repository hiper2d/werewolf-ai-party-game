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
    return viewGameAs(game, viewerOf(game, session?.user?.email));
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
