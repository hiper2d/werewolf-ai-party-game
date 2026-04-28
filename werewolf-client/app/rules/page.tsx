import {redirect} from "next/navigation";
import {auth} from "@/auth";
import {ROLE_CONFIGS, PLAY_STYLE_CONFIGS} from "@/app/api/game-models";

export default async function RulesPage() {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Frules');
    }

    return (
        <div className="flex flex-col h-full text-[var(--fg-0)] overflow-auto max-w-[900px] mx-auto w-full py-6">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] mb-6">How to Play</h1>

            {/* Overview */}
            <section className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] p-6 shadow-card mb-5">
                <h2 className="text-[16px] font-semibold mb-3">Overview</h2>
                <p className="text-[13px] text-[var(--fg-1)] leading-relaxed">
                    Werewolf AI Party Game is a social deduction game where AI bots pretend to be humans.
                    Each bot has a secret role, personal goals, and unique personality — and none of them
                    know which other players are AI. You, the human player, join the game alongside these
                    bots and try to survive while uncovering the werewolves hiding among you.
                </p>
            </section>

            {/* Roles */}
            <section className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] p-6 shadow-card mb-5">
                <h2 className="text-[16px] font-semibold mb-4">Roles</h2>
                <div className="space-y-4">
                    {Object.entries(ROLE_CONFIGS).map(([key, role]) => (
                        <div key={key} className="border-b border-[var(--line-1)] pb-3 last:border-b-0 last:pb-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-[14px] font-semibold">{role.name}</h3>
                                <span className={`text-[10px] font-mono uppercase tracking-[0.06em] px-2 py-0.5 rounded border ${
                                    role.alignment === 'evil'
                                        ? 'bg-[oklch(60%_0.13_25_/_0.12)] border-[oklch(60%_0.13_25_/_0.3)] text-[var(--werewolf-fg)]'
                                        : 'bg-[oklch(60%_0.14_145_/_0.12)] border-[oklch(60%_0.14_145_/_0.3)] text-[var(--gm-fg)]'
                                }`}>
                                    {role.alignment === 'evil' ? 'Werewolf Team' : 'Village Team'}
                                </span>
                            </div>
                            <p className="text-[13px] text-[var(--fg-1)]">{role.description}</p>
                            {role.hasNightAction && (
                                <p className="text-[11px] text-[var(--fg-2)] mt-1 italic">
                                    Has a night action (priority: {role.nightActionOrder})
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Game Phases */}
            <section className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] p-6 shadow-card mb-5">
                <h2 className="text-[16px] font-semibold mb-4">Game Phases</h2>
                <p className="text-[13px] text-[var(--fg-1)] mb-4">
                    The game alternates between Day and Night phases, starting with Day.
                    It continues until one team achieves victory.
                </p>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-[14px] font-semibold mb-1">1. Day Discussion</h3>
                        <p className="text-[13px] text-[var(--fg-1)]">
                            All alive players discuss who they think the werewolves are. Players can say
                            anything — there are no limitations, and it doesn&apos;t have to be true.
                            Nobody has to believe you. After a certain number of messages, the human player
                            can trigger the voting. Voting can also be triggered automatically when the
                            discussion reaches a message limit.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-[14px] font-semibold mb-1">2. Voting</h3>
                        <p className="text-[13px] text-[var(--fg-1)]">
                            Each alive player votes for exactly one other alive player. The order is fixed
                            but arbitrary — no one is allowed to skip and must vote when it&apos;s their turn.
                            The player with the most votes is eliminated and their role is revealed. In case
                            of a tie, the Game Master decides who dies randomly.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-[14px] font-semibold mb-1">3. Night</h3>
                        <p className="text-[13px] text-[var(--fg-1)] mb-2">
                            During the night, werewolves and villagers with special roles take their turns
                            in a predefined order:
                        </p>
                        <ol className="list-decimal list-inside text-[13px] text-[var(--fg-1)] space-y-2 ml-2">
                            <li>
                                <span className="font-semibold text-[var(--fg-0)]">Maniac</span> — Picks any
                                other alive player to abduct for the night. The abducted player cannot perform
                                any actions and cannot be targeted by other players (all attempts fail). If the
                                Maniac dies during the night, the abducted player also dies. Abducting a werewolf
                                has no effect, unless it is the last alive werewolf — in that case, the werewolf
                                skips their turn.
                            </li>
                            <li>
                                <span className="font-semibold text-[var(--fg-0)]">Werewolves</span> — They have
                                a short private chat, then decide who to target. If nobody saves the target, they die.
                            </li>
                            <li>
                                <span className="font-semibold text-[var(--fg-0)]">Doctor</span> — Picks an alive
                                player to heal (including themselves). The healed player cannot die this night for
                                any reason. Cannot heal the same player two nights in a row. Also has a one-per-game
                                ability to kill a target instead of healing.
                            </li>
                            <li>
                                <span className="font-semibold text-[var(--fg-0)]">Detective</span> — Picks an alive
                                player to either check or kill (one-time ability). If checking, the Game Master reveals
                                whether the target is good or bad without revealing names or giving hints. All villagers
                                except the Maniac are good. All werewolves and the Maniac are bad.
                            </li>
                        </ol>
                        <p className="text-[13px] text-[var(--fg-1)] mt-2">
                            After all roles act, the Game Master announces who died and provides a high-level
                            summary of what happened. Then the next day begins.
                        </p>
                    </div>
                </div>
            </section>

            {/* Win Conditions */}
            <section className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] p-6 shadow-card mb-5">
                <h2 className="text-[16px] font-semibold mb-4">Win Conditions</h2>
                <div className="space-y-3">
                    <div>
                        <h3 className="text-[14px] font-semibold text-[var(--gm-fg)]">Village Team Wins</h3>
                        <p className="text-[13px] text-[var(--fg-1)]">
                            All werewolves are eliminated. The villagers, doctor, detective, and maniac all
                            win together.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-[14px] font-semibold text-[var(--werewolf-fg)]">Werewolf Team Wins</h3>
                        <p className="text-[13px] text-[var(--fg-1)]">
                            Werewolves equal or outnumber the remaining villagers. At that point, the
                            werewolves can no longer be voted out and take control.
                        </p>
                    </div>
                </div>
            </section>

            {/* Play Styles */}
            <section className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] p-6 shadow-card mb-5">
                <h2 className="text-[16px] font-semibold mb-4">Play Styles</h2>
                <p className="text-[13px] text-[var(--fg-1)] mb-4">
                    Each AI bot is assigned a play style that shapes their personality and strategy during the game.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(PLAY_STYLE_CONFIGS).map(([key, style]) => (
                        <div key={key} className="border border-[var(--line-1)] rounded-[var(--radius-md)] p-3">
                            <h3 className="font-semibold text-[13px] mb-1">{style.name}</h3>
                            <p className="text-[12px] text-[var(--fg-2)]">{style.uiDescription}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
