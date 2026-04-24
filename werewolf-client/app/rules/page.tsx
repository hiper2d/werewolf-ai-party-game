import {redirect} from "next/navigation";
import {auth} from "@/auth";
import {ROLE_CONFIGS, PLAY_STYLE_CONFIGS} from "@/app/api/game-models";

export default async function RulesPage() {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Frules');
    }

    return (
        <div className="page-section" style={{ color: 'var(--ember-ink-0)', maxWidth: 960 }}>
            <h1 className="h-title">How to Play</h1>
            <p className="h-sub" style={{ marginBottom: 24 }}>Everything you need to know about Werewolf AI</p>

            {/* Overview */}
            <div className="panel-sm p-6 mb-6">
                <h2 className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-fire-4)', marginBottom: 10 }}>OVERVIEW</h2>
                <p style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7 }}>
                    Werewolf AI Party Game is a social deduction game where AI bots pretend to be humans.
                    Each bot has a secret role, personal goals, and unique personality — and none of them
                    know which other players are AI. You, the human player, join the game alongside these
                    bots and try to survive while uncovering the werewolves hiding among you.
                </p>
            </div>

            {/* Roles */}
            <div className="panel-sm p-6 mb-6">
                <h2 className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-fire-4)', marginBottom: 12 }}>ROLES</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Object.entries(ROLE_CONFIGS).map(([key, role]) => (
                        <div key={key} style={{ borderBottom: '1px solid var(--ember-border)', paddingBottom: 10 }}>
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-ink-0)' }}>{role.name.toUpperCase()}</h3>
                                <span
                                    className="pixel-text"
                                    style={{
                                        fontSize: 7,
                                        letterSpacing: 2,
                                        padding: '2px 6px',
                                        background: 'var(--ember-bg-0)',
                                        border: '1px solid currentColor',
                                        color: role.alignment === 'evil' ? 'var(--ember-team-wolf)' : 'var(--ember-team-village)',
                                    }}
                                >
                                    {role.alignment === 'evil' ? 'WOLF TEAM' : 'VILLAGE TEAM'}
                                </span>
                            </div>
                            <p style={{ fontSize: 14, color: 'var(--ember-ink-2)', margin: 0 }}>{role.description}</p>
                            {role.hasNightAction && (
                                <p className="console-text" style={{ fontSize: 12, color: 'var(--ember-ink-3)', marginTop: 4 }}>
                                    Night action priority: {role.nightActionOrder}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Game Phases */}
            <div className="panel-sm p-6 mb-6">
                <h2 className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-fire-4)', marginBottom: 12 }}>GAME PHASES</h2>
                <p className="console-text" style={{ fontSize: 14, color: 'var(--ember-ink-2)', marginBottom: 16 }}>
                    Day and Night alternate. The game continues until one team wins.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <PhaseBlock num="1" title="DAY DISCUSSION">
                        All alive players discuss who they think the werewolves are. After enough messages,
                        the human player can trigger voting. Voting can also trigger automatically.
                    </PhaseBlock>
                    <PhaseBlock num="2" title="VOTING">
                        Each alive player votes for one other alive player. The player with the most votes
                        is eliminated and their role is revealed. Ties are broken randomly by the Game Master.
                    </PhaseBlock>
                    <PhaseBlock num="3" title="NIGHT">
                        <p style={{ marginBottom: 8 }}>
                            Werewolves and special roles act in order:
                        </p>
                        <ol style={{ listStyleType: 'decimal', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <li><strong style={{ color: 'var(--ember-ink-0)' }}>Maniac</strong> — Abducts a player, blocking their actions and protecting them from targeting.</li>
                            <li><strong style={{ color: 'var(--ember-ink-0)' }}>Werewolves</strong> — Discuss privately, then choose a target to eliminate.</li>
                            <li><strong style={{ color: 'var(--ember-ink-0)' }}>Doctor</strong> — Protects one player from death (can&apos;t repeat). One-time kill ability.</li>
                            <li><strong style={{ color: 'var(--ember-ink-0)' }}>Detective</strong> — Investigates a player (good/bad). One-time kill ability.</li>
                        </ol>
                        <p style={{ marginTop: 8 }}>
                            After all roles act, the Game Master announces deaths and the next day begins.
                        </p>
                    </PhaseBlock>
                </div>
            </div>

            {/* Win Conditions */}
            <div className="panel-sm p-6 mb-6">
                <h2 className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-fire-4)', marginBottom: 12 }}>WIN CONDITIONS</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                        <h3 className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-team-village)', marginBottom: 4 }}>VILLAGE TEAM WINS</h3>
                        <p style={{ fontSize: 14, color: 'var(--ember-ink-2)', margin: 0 }}>
                            All werewolves are eliminated. Villagers, doctor, detective, and maniac all win together.
                        </p>
                    </div>
                    <div className="hr-pixel" style={{ margin: '4px 0' }} />
                    <div>
                        <h3 className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-team-wolf)', marginBottom: 4 }}>WEREWOLF TEAM WINS</h3>
                        <p style={{ fontSize: 14, color: 'var(--ember-ink-2)', margin: 0 }}>
                            Werewolves equal or outnumber the remaining villagers.
                        </p>
                    </div>
                </div>
            </div>

            {/* Play Styles */}
            <div className="panel-sm p-6 mb-6">
                <h2 className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-fire-4)', marginBottom: 12 }}>PLAY STYLES</h2>
                <p className="console-text" style={{ fontSize: 14, color: 'var(--ember-ink-2)', marginBottom: 12 }}>
                    Each AI bot is assigned a play style that shapes their personality and strategy.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                    {Object.entries(PLAY_STYLE_CONFIGS).map(([key, style]) => (
                        <div key={key} style={{ padding: 12, border: '1px solid var(--ember-border)', background: 'var(--ember-bg-3)' }}>
                            <h3 className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-0)', marginBottom: 4 }}>{style.name.toUpperCase()}</h3>
                            <p style={{ fontSize: 13, color: 'var(--ember-ink-2)', margin: 0, lineHeight: 1.5 }}>{style.uiDescription}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function PhaseBlock({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className="pixel-text" style={{
                    fontSize: 9, width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--ember-fire-3)', color: '#0a0a14',
                    border: '2px solid var(--ember-fire-4)',
                }}>
                    {num}
                </span>
                <h3 className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-ink-0)' }}>{title}</h3>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ember-ink-2)', lineHeight: 1.6, paddingLeft: 30 }}>
                {children}
            </div>
        </div>
    );
}
