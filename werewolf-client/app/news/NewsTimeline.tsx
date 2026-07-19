'use client';

import {useState} from "react";
import Link from "next/link";
import {CHANGELOG} from "@/app/news/changelog";

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
