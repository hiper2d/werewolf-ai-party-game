'use client';

import {useState, type ReactNode} from "react";
import Link from "next/link";
import {DISCORD_URL} from "@/app/config/external-links";

// ── Icons ────────────────────────────────────────────────────────────────────
function ArrowRightIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
    );
}

function ArrowLeftIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 18l-6-6 6-6"/>
        </svg>
    );
}

// ── Changelog data ────────────────────────────────────────────────────────────
interface ChangelogEntry {
    id: string;
    date: string;
    tags: string[];
    title: string;
    body: ReactNode;
    media: { label: string; youtubeId?: string } | null;
    links: { label: string; href: string }[];
}

const CHANGELOG: ChangelogEntry[] = [
    {
        id: "discord-server", date: "Jun 2026", tags: ["Community"],
        title: "We're on Discord",
        body: (<>Werewolf AI now has a <strong>Discord server</strong> — a place to share stories from your best
            games, swap strategies, send feedback and bug reports, and follow the news as the project grows.
            You&apos;ll find a <strong>Join the Discord</strong> link on the home page and pinned in the sidebar of
            every game. Come meet the other humans at the table.</>),
        media: null,
        links: [{label: "Join the Discord", href: DISCORD_URL}],
    },
    {
        id: "sakana-fugu", date: "Jun 2026", tags: ["Models"],
        title: "Sakana Fugu — a new model family",
        body: (<><strong>Sakana AI</strong> joins the table with two new models. <strong>Fugu</strong> is the
            lighter, everyday option — light enough to play on the free tier — and <strong>Fugu Ultra</strong> is
            the heavyweight. Both reason before they answer, which helps when a bot has to hold a story and a
            bluff at the same time. Pick either for any bot or the Game Master when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "glm-5-2", date: "Jun 2026", tags: ["Models"],
        title: "GLM-5.2 replaces GLM-5.1",
        body: (<>Z.AI&apos;s <strong>GLM-5.2</strong> takes over the GLM slot in the model picker, with or
            without Thinking. Same price as before — just a newer, sharper model behind the same option. Pick it
            for any bot or the Game Master when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "fable-5-shutdown", date: "Jun 2026", tags: ["Models"],
        title: "Claude Fable 5 has been shut down",
        body: (<>Anthropic has shut down <strong>Claude Fable 5</strong> for good, so it&apos;s gone from the
            model picker for bots and the Game Master. Every other model is unaffected — pick any of them when
            you set up a lobby.</>),
        media: null,
        links: [{label: "Anthropic's announcement", href: "https://www.anthropic.com/news/fable-mythos-access"}],
    },
    {
        id: "fable-5", date: "Jun 2026", tags: ["Models"],
        title: "Claude Fable 5 joins the table",
        body: (<>Anthropic&apos;s newest model, <strong>Claude Fable 5</strong>, is now selectable for any bot
            or the Game Master. It&apos;s especially strong at staying in character across a long game — useful
            when a bot has to hold both a story and a bluff for several nights running. Add it from the model
            picker when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "create-a-game-video", date: "Jun 2026", tags: ["Guides"],
        title: "New video: how to create a game",
        body: (<>A short walkthrough of the full setup flow — pick a theme, set the player and werewolf count,
            choose special roles, generate a preview, and tweak any character before you start.</>),
        media: {label: "youtube · how to create a game", youtubeId: "nwHEuNbRXXQ"},
        links: [{label: "Read the rules", href: "/rules"}],
    },
    {
        id: "rules-rewrite", date: "Jun 2026", tags: ["Guides"],
        title: "Rewritten rules page",
        body: (<>The rules page got a clearer rewrite — each role, the night order, and the win conditions are
            easier to scan, now with embedded video tutorials.</>),
        media: null,
        links: [{label: "Read the rules", href: "/rules"}],
    },
    {
        id: "ui-refresh", date: "Jun 2026", tags: ["Design"],
        title: "Restyled pages, a News feed, and a coffee badge",
        body: (<>Several pages got a visual cleanup, this News page is new, and there&apos;s now a
            &ldquo;Buy me a coffee&rdquo; badge. Every game burns real AI tokens, so a coffee goes straight
            toward the API bills.</>),
        media: null,
        links: [{label: "About the project", href: "/about"}],
    },
    {
        id: "deepseek-stability", date: "Jun 2026", tags: ["Fixes"],
        title: "Steadier DeepSeek V4 reasoning",
        body: (<>Fixed a bug where the <strong>DeepSeek V4</strong> reasoning model would occasionally crash
            mid-game — its thinking output sometimes came back as malformed JSON. It&apos;s stable now.</>),
        media: null,
        links: [],
    },
];

// ── YouTube facade — styled 16:9 placeholder that lazy-loads a real iframe ─────
function Yt({label, youtubeId}: { label: string; youtubeId?: string }) {
    const [loaded, setLoaded] = useState(false);

    if (loaded && youtubeId) {
        return (
            <div className="yt-frame">
                <iframe
                    src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
                    title={label}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                />
            </div>
        );
    }

    return (
        <div
            className="yt"
            role="button"
            tabIndex={0}
            onClick={() => youtubeId && setLoaded(true)}
            onKeyDown={(e) => {
                if (youtubeId && (e.key === "Enter" || e.key === " ")) setLoaded(true);
            }}
            title={youtubeId ? "Play video" : "Video coming soon"}
        >
            {youtubeId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    className="yt-thumb"
                    src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
                    alt={label}
                    loading="lazy"
                />
            )}
            <div className="play"/>
            <span className="yt-lbl">{label}</span>
        </div>
    );
}

export default function NewsTimeline() {
    return (
        <main className="news-doc">
            <header className="news-head">
                <span className="doc-kicker"><span className="pip"/>Product · Changelog</span>
                <h1 className="news-title">What&apos;s New</h1>
                <p className="news-sub">
                    Every new model, theme, and feature we ship to the table — newest first.
                </p>
            </header>

            <div className="tl">
                <div className="tl-track">
                    {CHANGELOG.map((e) => (
                        <article className="tl-node" key={e.id}>
                            <div className="tl-meta">
                                <span className="date-meta">{e.date}</span>
                                <span className="tl-tags">
                                    {e.tags.map((t) => <span className="tag-chip" key={t}>{t}</span>)}
                                </span>
                            </div>
                            <h2 className="tl-title">{e.title}</h2>
                            <p className="news-body">{e.body}</p>
                            {e.media && (
                                <div className="tl-media">
                                    <Yt label={e.media.label} youtubeId={e.media.youtubeId}/>
                                </div>
                            )}
                            {e.links.length > 0 && (
                                <div className="tl-actions">
                                    {e.links.map((l, i) => (
                                        l.href.startsWith("http") ? (
                                            <a className="news-link" href={l.href} key={i}
                                               target="_blank" rel="noopener noreferrer">
                                                {l.label}<ArrowRightIcon/>
                                            </a>
                                        ) : (
                                            <Link className="news-link" href={l.href} key={i}>
                                                {l.label}<ArrowRightIcon/>
                                            </Link>
                                        )
                                    ))}
                                </div>
                            )}
                        </article>
                    ))}
                </div>

                <div className="news-foot">
                    <Link className="back-home" href="/"><ArrowLeftIcon/>Back to Home</Link>
                    <span className="foot-note">© 2026 AIWerewolf.net</span>
                </div>
            </div>
        </main>
    );
}
