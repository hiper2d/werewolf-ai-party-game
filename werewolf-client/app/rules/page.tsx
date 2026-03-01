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
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">1. Day Discussion</h3>
                        <p className="theme-text-secondary text-sm">
                            All players discuss who they think the werewolves are. Bots share observations,
                            make accusations, and defend themselves. You can send messages to participate
                            in the discussion. After enough messages have been exchanged, voting begins automatically.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-1">2. Voting</h3>
                        <p className="theme-text-secondary text-sm">
                            Each player votes to eliminate one suspect. The player with the most votes is
                            eliminated and their role is revealed. If there is a tie, no one is eliminated.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-1">3. Night</h3>
                        <p className="theme-text-secondary text-sm">
                            Special roles act in order: the Maniac abducts a player (blocking their actions),
                            the Werewolves choose a victim to eliminate, the Doctor protects someone, and the
                            Detective investigates a player. Results are revealed the next morning.
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
