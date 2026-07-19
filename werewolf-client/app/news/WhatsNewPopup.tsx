'use client';

import {useCallback, useEffect, useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {CHANGELOG} from "@/app/news/changelog";
import {readLastSeenNewsId, shouldShowWhatsNew, writeLastSeenNewsId} from "@/app/news/whats-new";

function ArrowRightIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
    );
}

export default function WhatsNewPopup() {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();
    const latest = CHANGELOG[0];

    const dismiss = useCallback(() => {
        if (latest) writeLastSeenNewsId(latest.id);
        setIsOpen(false);
    }, [latest]);

    useEffect(() => {
        if (!latest) return;
        if (pathname === '/news') {
            // Reading the news page counts as seeing the latest entry.
            writeLastSeenNewsId(latest.id);
            setIsOpen(false);
            return;
        }
        const stored = readLastSeenNewsId();
        if (stored === null) {
            // First visit: everything is new, so nothing is "news" — seed silently.
            writeLastSeenNewsId(latest.id);
            return;
        }
        if (shouldShowWhatsNew(stored, latest.id)) {
            setIsOpen(true);
        }
    }, [pathname, latest]);

    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') dismiss();
        };
        document.addEventListener('keydown', onEsc);
        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener('keydown', onEsc);
        };
    }, [isOpen, dismiss]);

    if (!isOpen || !latest) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={dismiss} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="whats-new-title"
                className="relative z-10 max-w-lg w-full mx-4 max-h-[80dvh] overflow-y-auto bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] shadow-pop"
            >
                <div className="flex items-center justify-between px-5 pt-4">
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent-text)]">
                        What&apos;s New
                    </span>
                    <button
                        aria-label="Close"
                        className="p-1 rounded-[var(--radius-md)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]"
                        onClick={dismiss}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M6 6l12 12M18 6L6 18"/>
                        </svg>
                    </button>
                </div>
                <div className="news-doc !px-5 !pb-5 !pt-2">
                    <article>
                        <div className="tl-meta">
                            <span className="date-meta">{latest.date}</span>
                            <span className="tl-tags">
                                {latest.tags.map((t) => <span className="tag-chip" key={t}>{t}</span>)}
                            </span>
                        </div>
                        <h2 id="whats-new-title" className="tl-title">{latest.title}</h2>
                        <p className="news-body">{latest.body}</p>
                        <div className="flex flex-wrap items-center gap-4 mt-4">
                            {latest.links.map((l, i) => (
                                l.href.startsWith("http") ? (
                                    <a className="news-link" href={l.href} key={i}
                                       target="_blank" rel="noopener noreferrer" onClick={dismiss}>
                                        {l.label}<ArrowRightIcon/>
                                    </a>
                                ) : (
                                    <Link className="news-link" href={l.href} key={i} onClick={dismiss}>
                                        {l.label}<ArrowRightIcon/>
                                    </Link>
                                )
                            ))}
                            <Link
                                href="/news"
                                onClick={dismiss}
                                className="ml-auto px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] transition-all duration-[120ms]"
                            >
                                See all updates
                            </Link>
                        </div>
                    </article>
                </div>
            </div>
        </div>
    );
}
