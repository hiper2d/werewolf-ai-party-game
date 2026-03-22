import {redirect} from "next/navigation";
import {auth} from "@/auth";
import {ROLE_CONFIGS, PLAY_STYLE_CONFIGS} from "@/app/api/game-models";

export default async function RulesPage() {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Frules');
    }

    return (
        <div className="flex flex-col h-full theme-text-primary overflow-auto p-6">
            <h1 className="text-3xl font-bold mb-6">How to Play</h1>

            {/* Overview */}
            <section className="theme-bg-card theme-border border rounded-lg p-6 theme-shadow mb-6">
                <h2 className="text-2xl font-semibold mb-3">Overview</h2>
                <p className="theme-text-secondary leading-relaxed">
                    Werewolf AI Party Game is a social deduction game where AI bots pretend to be humans.
                    Each bot has a secret role, personal goals, and unique personality — and none of them
                    know which other players are AI. You, the human player, join the game alongside these
                    bots and try to survive while uncovering the werewolves hiding among you.
                </p>
            </section>

            {/* Roles */}
            <section className="theme-bg-card theme-border border rounded-lg p-6 theme-shadow mb-6">
                <h2 className="text-2xl font-semibold mb-4">Roles</h2>
                <div className="space-y-4">
                    {Object.entries(ROLE_CONFIGS).map(([key, role]) => (
                        <div key={key} className="border-b theme-border pb-3 last:border-b-0 last:pb-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold">{role.name}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    role.alignment === 'evil'
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'bg-green-500/20 text-green-400'
                                }`}>
                                    {role.alignment === 'evil' ? 'Werewolf Team' : 'Village Team'}
                                </span>
                            </div>
                            <p className="theme-text-secondary text-sm">{role.description}</p>
                            {role.hasNightAction && (
                                <p className="text-xs theme-text-secondary mt-1 italic">
                                    Has a night action (priority: {role.nightActionOrder})
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Game Phases */}
            <section className="theme-bg-card theme-border border rounded-lg p-6 theme-shadow mb-6">
                <h2 className="text-2xl font-semibold mb-4">Game Phases</h2>
                <p className="theme-text-secondary text-sm mb-4">
                    The game alternates between Day and Night phases, starting with Day.
                    It continues until one team achieves victory.
                </p>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">1. Day Discussion</h3>
                        <p className="theme-text-secondary text-sm">
                            All alive players discuss who they think the werewolves are. Players can say
                            anything — there are no limitations, and it doesn&apos;t have to be true.
                            Nobody has to believe you. After a certain number of messages, the human player
                            can trigger the voting. Voting can also be triggered automatically when the
                            discussion reaches a message limit.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-1">2. Voting</h3>
                        <p className="theme-text-secondary text-sm">
                            Each alive player votes for exactly one other alive player. The order is fixed
                            but arbitrary — no one is allowed to skip and must vote when it&apos;s their turn.
                            The player with the most votes is eliminated and their role is revealed. In case
                            of a tie, the Game Master decides who dies randomly.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-1">3. Night</h3>
                        <p className="theme-text-secondary text-sm mb-2">
                            During the night, werewolves and villagers with special roles take their turns
                            in a predefined order:
                        </p>
                        <ol className="list-decimal list-inside theme-text-secondary text-sm space-y-2 ml-2">
                            <li>
                                <span className="font-semibold theme-text-primary">Maniac</span> — Picks any
                                other alive player to abduct for the night. The abducted player cannot perform
                                any actions and cannot be targeted by other players (all attempts fail). If the
                                Maniac dies during the night, the abducted player also dies. Abducting a werewolf
                                has no effect, unless it is the last alive werewolf — in that case, the werewolf
                                skips their turn.
                            </li>
                            <li>
                                <span className="font-semibold theme-text-primary">Werewolves</span> — They have
                                a short private chat, then decide who to target. If nobody saves the target, they die.
                            </li>
                            <li>
                                <span className="font-semibold theme-text-primary">Doctor</span> — Picks an alive
                                player to heal (including themselves). The healed player cannot die this night for
                                any reason. Cannot heal the same player two nights in a row. Also has a one-per-game
                                ability to kill a target instead of healing.
                            </li>
                            <li>
                                <span className="font-semibold theme-text-primary">Detective</span> — Picks an alive
                                player to either check or kill (one-time ability). If checking, the Game Master reveals
                                whether the target is good or bad without revealing names or giving hints. All villagers
                                except the Maniac are good. All werewolves and the Maniac are bad.
                            </li>
                        </ol>
                        <p className="theme-text-secondary text-sm mt-2">
                            After all roles act, the Game Master announces who died and provides a high-level
                            summary of what happened. Then the next day begins.
                        </p>
                    </div>
                </div>
            </section>

            {/* Win Conditions */}
            <section className="theme-bg-card theme-border border rounded-lg p-6 theme-shadow mb-6">
                <h2 className="text-2xl font-semibold mb-4">Win Conditions</h2>
                <div className="space-y-3">
                    <div>
                        <h3 className="text-lg font-semibold text-green-400">Village Team Wins</h3>
                        <p className="theme-text-secondary text-sm">
                            All werewolves are eliminated. The villagers, doctor, detective, and maniac all
                            win together.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-red-400">Werewolf Team Wins</h3>
                        <p className="theme-text-secondary text-sm">
                            Werewolves equal or outnumber the remaining villagers. At that point, the
                            werewolves can no longer be voted out and take control.
                        </p>
                    </div>
                </div>
            </section>

            {/* Play Styles */}
            <section className="theme-bg-card theme-border border rounded-lg p-6 theme-shadow mb-6">
                <h2 className="text-2xl font-semibold mb-4">Play Styles</h2>
                <p className="theme-text-secondary text-sm mb-4">
                    Each AI bot is assigned a play style that shapes their personality and strategy during the game.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(PLAY_STYLE_CONFIGS).map(([key, style]) => (
                        <div key={key} className="border theme-border rounded p-3">
                            <h3 className="font-semibold text-sm mb-1">{style.name}</h3>
                            <p className="theme-text-secondary text-xs">{style.uiDescription}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
