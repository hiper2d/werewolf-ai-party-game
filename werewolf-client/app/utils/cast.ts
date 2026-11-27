import type {Bot, Game} from '@/app/api/game-models';

/**
 * Who at the table is played by a person (docs/plan-multiplayer.md, "B. Seats"). Pure:
 * usable on the server and in tests, and on the full game only (a view has no seats).
 *
 * The data has two kinds of human, for history's sake:
 *  - the FIRST human, who created the game: `humanPlayerName / Role / IsAlive` on the game
 *    itself, never an entry in `bots`. A solo game has only this one, stored exactly as
 *    before seats existed.
 *  - every OTHER human: an ordinary entry in `bots` (name, role, alive flag, voice, story,
 *    portrait) whose name is some seat's `character`. Taking a bot over is adding a seat,
 *    leaving is removing it; the entry keeps its model for the day it is a bot again.
 * `game.seats` is the one record of who plays whom; nothing on the entry repeats it.
 */
type Cast = Pick<Game, 'bots' | 'humanPlayerName' | 'humanPlayerRole' | 'humanPlayerIsAlive' | 'seats'>;

/** Names of the cast entries played by a person (never the first human, who is not in the cast). */
export function humanCastNames(game: Pick<Game, 'seats' | 'humanPlayerName'>): Set<string> {
    const names = new Set<string>();
    for (const seat of Object.values(game.seats || {})) {
        if (seat?.character && seat.character !== game.humanPlayerName) names.add(seat.character);
    }
    return names;
}

/** Every human's name, the first human first. */
export function humanNames(game: Pick<Game, 'seats' | 'humanPlayerName'>): string[] {
    return [game.humanPlayerName, ...humanCastNames(game)];
}

export function isHumanName(game: Pick<Game, 'seats' | 'humanPlayerName'>, name: string): boolean {
    return name === game.humanPlayerName || humanCastNames(game).has(name);
}

/** The cast entries a model plays: the ones to ask for a reply, a vote, a night action, notes. */
export function aiBots(game: Pick<Game, 'bots' | 'seats' | 'humanPlayerName'>): Bot[] {
    const humans = humanCastNames(game);
    return humans.size === 0 ? game.bots : game.bots.filter(bot => !humans.has(bot.name));
}

/** A player's role by name, human or bot; null for a name that is not at the table. */
export function playerRole(game: Cast, name: string): string | null {
    if (name === game.humanPlayerName) return game.humanPlayerRole;
    return game.bots.find(bot => bot.name === name)?.role ?? null;
}

/** Is the player alive? False for a name that is not at the table. */
export function isPlayerAlive(game: Cast, name: string): boolean {
    if (name === game.humanPlayerName) return game.humanPlayerIsAlive !== false;
    return game.bots.find(bot => bot.name === name)?.isAlive === true;
}

/**
 * Everybody alive at the table, humans and bots: who votes, who can be voted for, how
 * large the table is. The cast in its order, then the first human (as the vote queue
 * has always been built).
 */
export function alivePlayerNames(game: Cast): string[] {
    return [
        ...game.bots.filter(bot => bot.isAlive).map(bot => bot.name),
        ...(game.humanPlayerIsAlive !== false ? [game.humanPlayerName] : []),
    ];
}

/** More than one person plays this game. */
export function isSharedGame(game: Pick<Game, 'seats' | 'humanPlayerName'>): boolean {
    return humanCastNames(game).size > 0;
}

/** The humans still alive. A shared game ends for everybody when this is empty. */
export function livingHumanNames(game: Cast): string[] {
    return humanNames(game).filter(name => isPlayerAlive(game, name));
}
