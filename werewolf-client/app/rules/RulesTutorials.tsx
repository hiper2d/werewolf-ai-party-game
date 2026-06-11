'use client';

import {useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {PLAY_STYLE_CONFIGS} from "@/app/api/game-models";

interface TutorialVideo {
    id: string;
    title: string;
    description: string;
    youtubeId: string | null;
    duration: string | null;
}

const OVERVIEW_VIDEO = {
    youtubeId: '6x5awI8HRK0',
    title: 'The Rules in 2 Minutes',
};

const TUTORIALS: TutorialVideo[] = [
    {
        id: 'create-a-game',
        title: 'How to Create a Game',
        description: 'Set player count, pick the AI opponents, and choose special roles.',
        youtubeId: 'nwHEuNbRXXQ',
        duration: null,
    },
    {
        id: 'full-game',
        title: 'Watch a Full Game',
        description: 'A complete playthrough — setup, the night phase, village debate, and the final vote.',
        youtubeId: null,
        duration: null,
    },
    {
        id: 'special-roles',
        title: 'Special Roles, Explained',
        description: 'Detective, Doctor, and the rest — when they act and how they swing a round.',
        youtubeId: null,
        duration: null,
    },
];

const READY_TUTORIALS = TUTORIALS.filter(t => t.youtubeId !== null);

interface RoleDetail {
    name: string;
    team: 'village' | 'werewolf';
    nightOrder: string | null;
    body: string;
    oneTimeAbility?: string;
}

const ROLE_DETAILS: RoleDetail[] = [
    {
        name: 'Werewolf',
        team: 'werewolf',
        nightOrder: 'Acts 2nd at night',
        body: 'The werewolves know each other. Each night they have a short private chat, then agree on one ' +
            'player to eliminate. If nobody saves the target, the target dies. During the day they blend in ' +
            'and vote like everyone else.',
    },
    {
        name: 'Maniac',
        team: 'village',
        nightOrder: 'Acts 1st at night',
        body: 'Picks any other alive player to abduct for the night. The abducted player cannot perform any ' +
            'actions and cannot be targeted by other players — all attempts fail. If the Maniac dies during ' +
            'the night, the abducted player dies too. Abducting a werewolf has no effect, unless it is the ' +
            'last alive werewolf — in that case the werewolf skips their turn. The Maniac wins with the ' +
            'village, but looks bad to the Detective’s investigation.',
    },
    {
        name: 'Doctor',
        team: 'village',
        nightOrder: 'Acts 3rd at night',
        body: 'Each night picks one alive player to heal, including themselves. The healed player cannot die ' +
            'that night for any reason. The Doctor cannot heal the same player two nights in a row.',
        oneTimeAbility: 'Doctor’s Mistake — once per game, the Doctor can kill a target instead of healing.',
    },
    {
        name: 'Detective',
        team: 'village',
        nightOrder: 'Acts 4th at night',
        body: 'Each night picks one alive player to investigate. The Game Master reveals whether the target is ' +
            'good or bad — without revealing names or giving hints. All villagers except the Maniac are good; ' +
            'all werewolves and the Maniac are bad.',
        oneTimeAbility: 'Detective’s Kill — once per game, the Detective can kill a target instead of investigating.',
    },
    {
        name: 'Villager',
        team: 'village',
        nightOrder: null,
        body: 'A regular villager with no special abilities. Their power is in the day phase — reading people, ' +
            'steering the debate, and voting wisely.',
    },
];

function PlayIcon({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z"/>
        </svg>
    );
}

function ClockIcon({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3 2"/>
        </svg>
    );
}

function BookIcon({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" className={className}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
        </svg>
    );
}

function FilmIcon({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" className={className}>
            <rect x="2" y="3" width="20" height="18" rx="2"/>
            <path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/>
        </svg>
    );
}

function VideoPlayer({youtubeId, title, autoplay}: { youtubeId: string; title: string; autoplay: boolean }) {
    return (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-[var(--line-2)] bg-black">
            <iframe
                key={youtubeId}
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}${autoplay ? '?autoplay=1' : ''}`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
            />
        </div>
    );
}

function RuleNumber({n}: { n: number }) {
    return (
        <span className="w-[22px] h-[22px] rounded-full flex-shrink-0 border border-[var(--line-2)] bg-[var(--bg-2)]
                         text-[var(--fg-1)] font-mono text-[11px] grid place-items-center">
            {n}
        </span>
    );
}

function RulesTab() {
    return (
        <div>
            <VideoPlayer youtubeId={OVERVIEW_VIDEO.youtubeId} title={OVERVIEW_VIDEO.title} autoplay={false}/>

            <div className="mt-[30px] flex flex-col gap-[26px]">
                <div>
                    <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-[var(--fg-0)]">
                        <RuleNumber n={1}/> The idea
                    </h3>
                    <p className="mt-2 ml-8 text-[14px] text-[var(--fg-1)] leading-[1.62] max-w-[66ch]">
                        Werewolf is a game of social deduction. The group is secretly split into two teams and plays
                        in alternating Day and Night phases until one team is wiped out. Villagers don&apos;t know who
                        the wolves are — wolves know everyone.
                    </p>
                    <p className="mt-2 ml-8 text-[14px] text-[var(--fg-1)] leading-[1.62] max-w-[66ch]">
                        In this version, your fellow players are AI bots pretending to be humans. Each bot has a
                        secret role, personal goals, and a unique personality — and none of them know which other
                        players are AI. You join the game alongside them and try to survive while uncovering the
                        werewolves hiding among you.
                    </p>
                </div>

                <div>
                    <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-[var(--fg-0)]">
                        <RuleNumber n={2}/> The two teams
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5 ml-8">
                        <div className="border border-[var(--line-1)] rounded-lg bg-[var(--bg-1)] px-4 py-3.5">
                            <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--accent-text)]">
                                <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_7px_var(--accent-line)]"/>
                                Village
                            </div>
                            <p className="mt-[7px] text-[13px] text-[var(--fg-2)] leading-[1.55]">
                                The majority. Find and vote out every Werewolf to win.
                            </p>
                        </div>
                        <div className="border border-[var(--line-1)] rounded-lg bg-[var(--bg-1)] px-4 py-3.5">
                            <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--danger)]">
                                <span className="w-2 h-2 rounded-full bg-[var(--danger)] shadow-[0_0_7px_var(--danger-line)]"/>
                                Werewolves
                            </div>
                            <p className="mt-[7px] text-[13px] text-[var(--fg-2)] leading-[1.55]">
                                The hidden minority. Survive until you equal the Villagers in number.
                            </p>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-[var(--fg-0)]">
                        <RuleNumber n={3}/> How a round works
                    </h3>
                    <p className="mt-2 ml-8 text-[14px] text-[var(--fg-1)] leading-[1.62] max-w-[66ch]">
                        The game starts with a Day and alternates between Day and Night until one team wins.
                    </p>
                    <ul className="mt-2 ml-8 pl-[18px] list-disc text-[14px] text-[var(--fg-1)] leading-[1.6] space-y-1.5">
                        <li>
                            <b className="text-[var(--fg-0)]">Day — discussion.</b> All alive players debate who the
                            werewolves are. There are no limits on what you can say, and it doesn&apos;t have to be
                            true — nobody has to believe you either. After a certain number of messages you can call
                            the vote; it also starts automatically when the discussion reaches a message limit.
                        </li>
                        <li>
                            <b className="text-[var(--fg-0)]">Day — voting.</b> Each alive player votes for exactly
                            one other alive player, in a fixed order — nobody is allowed to skip. The player with the
                            most votes is eliminated and their role is revealed. In case of a tie, the Game Master
                            decides who dies randomly.
                        </li>
                        <li>
                            <b className="text-[var(--fg-0)]">Night.</b> Everyone &quot;sleeps,&quot; and special
                            roles act in a fixed order: Maniac, then Werewolves, then Doctor, then Detective. When
                            all roles have acted, the Game Master announces who died with a short summary of the
                            night, and the next day begins.
                        </li>
                    </ul>
                </div>

                <div>
                    <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-[var(--fg-0)]">
                        <RuleNumber n={4}/> Winning
                    </h3>
                    <p className="mt-2 ml-8 text-[14px] text-[var(--fg-1)] leading-[1.62] max-w-[66ch]">
                        The Village wins the moment no Werewolves remain — the villagers, Doctor, Detective, and
                        Maniac all win together. The Werewolves win as soon as they reach parity — when their numbers
                        equal the Villagers&apos;, the village can no longer out-vote them.
                    </p>
                </div>

                <div>
                    <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-[var(--fg-0)]">
                        <RuleNumber n={5}/> Special roles
                    </h3>
                    <p className="mt-2 ml-8 text-[14px] text-[var(--fg-1)] leading-[1.62] max-w-[66ch]">
                        Optional roles add hidden information and twists — turn them on when you create a game.
                        Here is every role and what it can do:
                    </p>
                    <div className="flex flex-col gap-3 mt-2.5 ml-8">
                        {ROLE_DETAILS.map(role => (
                            <div key={role.name}
                                 className="border border-[var(--line-1)] rounded-lg bg-[var(--bg-1)] px-4 py-3.5">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <span className={`flex items-center gap-2 text-[13px] font-semibold ${
                                        role.team === 'werewolf' ? 'text-[var(--danger)]' : 'text-[var(--accent-text)]'
                                    }`}>
                                        <span className={`w-2 h-2 rounded-full ${
                                            role.team === 'werewolf'
                                                ? 'bg-[var(--danger)] shadow-[0_0_7px_var(--danger-line)]'
                                                : 'bg-[var(--accent)] shadow-[0_0_7px_var(--accent-line)]'
                                        }`}/>
                                        {role.name}
                                    </span>
                                    <span className={`font-mono text-[10px] uppercase tracking-[0.06em] border rounded px-1.5 py-px ${
                                        role.team === 'werewolf'
                                            ? 'text-[var(--danger)] border-[var(--danger-line)]'
                                            : 'text-[var(--fg-2)] border-[var(--line-2)]'
                                    }`}>
                                        {role.team === 'werewolf' ? 'Werewolf team' : 'Village team'}
                                    </span>
                                    {role.nightOrder && (
                                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--fg-2)] border border-[var(--line-2)] rounded px-1.5 py-px">
                                            {role.nightOrder}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-[7px] text-[13px] text-[var(--fg-1)] leading-[1.55]">
                                    {role.body}
                                </p>
                                {role.oneTimeAbility && (
                                    <p className="mt-1.5 text-[13px] text-[var(--fg-1)] leading-[1.55]">
                                        <b className="text-[var(--fg-0)]">One-time ability:</b> {role.oneTimeAbility}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-[var(--fg-0)]">
                        <RuleNumber n={6}/> Play styles
                    </h3>
                    <p className="mt-2 ml-8 text-[14px] text-[var(--fg-1)] leading-[1.62] max-w-[66ch]">
                        Each AI bot is assigned a play style that shapes its personality and strategy during the game.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5 ml-8">
                        {Object.entries(PLAY_STYLE_CONFIGS).map(([key, style]) => (
                            <div key={key}
                                 className="border border-[var(--line-1)] rounded-lg bg-[var(--bg-1)] px-4 py-3.5">
                                <div className="text-[13px] font-semibold text-[var(--fg-0)]">{style.name}</div>
                                <p className="mt-[7px] text-[13px] text-[var(--fg-2)] leading-[1.55]">
                                    {style.uiDescription}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function TutorialsTab() {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const active = (selectedId && TUTORIALS.find(t => t.id === selectedId)) || READY_TUTORIALS[0];

    return (
        <div>
            {active?.youtubeId && (
                <VideoPlayer youtubeId={active.youtubeId} title={active.title} autoplay={selectedId !== null}/>
            )}

            <div className="mt-[26px] flex flex-col gap-2.5">
                <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--fg-2)] mb-0.5">
                    <span>In this series</span>
                    <span>{TUTORIALS.length} videos</span>
                </div>

                {TUTORIALS.map(tutorial => {
                    const isReady = tutorial.youtubeId !== null;
                    const isActive = isReady && tutorial.id === active?.id;
                    return (
                        <button
                            key={tutorial.id}
                            type="button"
                            disabled={!isReady}
                            onClick={() => setSelectedId(tutorial.id)}
                            className={`flex gap-3.5 p-2.5 border rounded-lg text-left transition-all duration-[120ms] ${
                                isActive
                                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)]'
                                    : isReady
                                        ? 'border-[var(--line-1)] bg-[var(--bg-1)] cursor-pointer hover:border-[var(--line-3)] hover:bg-[var(--bg-2)]'
                                        : 'border-[var(--line-1)] bg-[var(--bg-1)] opacity-[0.62] cursor-default'
                            }`}
                        >
                            <div className={`relative flex-shrink-0 w-[150px] h-[84px] rounded-md overflow-hidden grid place-items-center ${
                                isReady ? 'bg-[#12161b] text-white/90' : 'bg-[var(--bg-3)] text-[var(--fg-3)]'
                            }`}>
                                {isReady ? (
                                    <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={`https://i.ytimg.com/vi/${tutorial.youtubeId}/mqdefault.jpg`}
                                            alt=""
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                        <span className="relative w-[30px] h-[30px] rounded-full bg-white/[0.12] border border-white/[0.22] grid place-items-center backdrop-blur-[2px]">
                                            <PlayIcon className="w-[13px] h-[13px] ml-0.5"/>
                                        </span>
                                        {tutorial.duration && (
                                            <span className="absolute bottom-[5px] right-[5px] bg-black/65 text-white font-mono text-[9px] px-[5px] py-0.5 rounded">
                                                {tutorial.duration}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <ClockIcon className="w-5 h-5"/>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 self-center">
                                <div className="text-[14px] font-semibold text-[var(--fg-0)]">{tutorial.title}</div>
                                <div className="text-[13px] text-[var(--fg-2)] mt-[3px] line-clamp-2">{tutorial.description}</div>
                                <div className="flex items-center gap-[9px] mt-2">
                                    {isReady && tutorial.duration && (
                                        <>
                                            <span className="font-mono text-[11px] text-[var(--fg-2)]">{tutorial.duration}</span>
                                            <span className="w-[3px] h-[3px] rounded-full bg-[var(--fg-3)]"/>
                                        </>
                                    )}
                                    {isActive ? (
                                        <span className="text-[10px] uppercase tracking-[0.05em] text-[var(--accent-text)] border border-[var(--accent-line)] bg-[var(--accent-soft)] rounded px-1.5 py-px">
                                            Playing
                                        </span>
                                    ) : isReady ? (
                                        <span className="text-[10px] uppercase tracking-[0.05em] text-[var(--fg-2)] border border-[var(--line-2)] rounded px-1.5 py-px">
                                            Tutorial
                                        </span>
                                    ) : (
                                        <span className="text-[10px] uppercase tracking-[0.05em] text-[var(--fg-3)] border border-[var(--line-2)] rounded px-1.5 py-px">
                                            Coming soon
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function RulesTutorials() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeTab: 'rules' | 'tutorials' = searchParams.get('tab') === 'tutorials' ? 'tutorials' : 'rules';

    const setTab = (tab: 'rules' | 'tutorials') => {
        router.replace(tab === 'rules' ? pathname : `${pathname}?tab=tutorials`, {scroll: false});
    };

    const tabClass = (isActive: boolean) =>
        `flex items-center gap-[7px] text-[13px] font-medium px-[18px] py-2 rounded-full border transition-all duration-[120ms] ${
            isActive
                ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent-text)]'
                : 'border-transparent text-[var(--fg-1)] hover:text-[var(--fg-0)]'
        }`;

    return (
        <div className="h-full overflow-auto text-[var(--fg-0)]">
            <div className="max-w-[860px] mx-auto w-full px-7 pt-[38px] pb-[60px]">
                <div>
                    <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--fg-2)] mb-2">
                        Rules &amp; Tutorials
                    </div>
                    <h1 className="text-[27px] font-bold tracking-[-0.02em]">Learn to play Werewolf</h1>
                    <p className="text-[14px] text-[var(--fg-2)] mt-[7px] max-w-[60ch]">
                        Watch short video walkthroughs, then dig into the full written rules — everything in one place.
                    </p>
                </div>

                <div className="inline-flex gap-1 my-0 mt-[18px] mb-[26px] p-1 bg-[var(--bg-2)] border border-[var(--line-2)] rounded-full"
                     role="tablist">
                    <button type="button" role="tab" aria-selected={activeTab === 'rules'}
                            className={tabClass(activeTab === 'rules')} onClick={() => setTab('rules')}>
                        <BookIcon className="w-[15px] h-[15px]"/> Rules
                    </button>
                    <button type="button" role="tab" aria-selected={activeTab === 'tutorials'}
                            className={tabClass(activeTab === 'tutorials')} onClick={() => setTab('tutorials')}>
                        <FilmIcon className="w-[15px] h-[15px]"/> Tutorials
                        <span className={`font-mono text-[10px] rounded-full px-1.5 leading-4 border ${
                            activeTab === 'tutorials'
                                ? 'text-[var(--accent-text)] border-[var(--accent-line)]'
                                : 'text-[var(--fg-2)] border-[var(--line-2)]'
                        }`}>
                            {READY_TUTORIALS.length}
                        </span>
                    </button>
                </div>

                {activeTab === 'rules' ? <RulesTab/> : <TutorialsTab/>}
            </div>
        </div>
    );
}
