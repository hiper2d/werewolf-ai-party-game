'use client';

import React, {useEffect, useState} from 'react';
import {getCreditStatus, getDiscordClaimCode} from '@/app/api/credit-actions';
import {DISCORD_URL} from '@/app/config/external-links';
import {DISCORD_CREDITS_COMMAND} from '@/app/utils/credits';
import {formatLimitUSD} from '@/app/api/errors';

/**
 * How to get the one-time extra free credits through the Discord server
 * (app/utils/credits.ts): join, then give the Marlow bot the personal code with a slash
 * command. Shown on the profile page and in the out-of-credits popup.
 *
 * The page may pass what it already knows; otherwise the block asks the server itself.
 */
export default function DiscordCredits({code: givenCode, amountUSD: givenAmount, claimed: givenClaimed}: {
    code?: string | null;
    amountUSD?: number;
    claimed?: boolean;
}) {
    const [code, setCode] = useState<string | null>(givenCode ?? null);
    const [amountUSD, setAmountUSD] = useState<number | undefined>(givenAmount);
    const [claimed, setClaimed] = useState<boolean | undefined>(givenClaimed);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (givenAmount === undefined || givenClaimed === undefined) {
                    const status = await getCreditStatus();
                    if (!cancelled && status) {
                        setAmountUSD(status.discordUSD);
                        setClaimed(status.discordClaimed);
                    }
                }
                if (!givenCode) {
                    const fresh = await getDiscordClaimCode();
                    if (!cancelled) setCode(fresh);
                }
            } catch {
                /* the block then shows the steps without a code */
            }
        })();
        return () => { cancelled = true; };
    }, [givenCode, givenAmount, givenClaimed]);

    if (amountUSD !== undefined && !(amountUSD > 0)) {
        return null;
    }
    const amount = amountUSD !== undefined ? formatLimitUSD(amountUSD) : 'more';
    if (claimed) {
        return (
            <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--fg-2)]">
                This account already got its free credits from Discord. They are given once.
            </p>
        );
    }

    const command = `/${DISCORD_CREDITS_COMMAND} code:${code ?? 'WOLF-…'}`;
    const copy = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard blocked: the command is on screen to select */
        }
    };

    return (
        <div className="flex flex-col gap-2.5">
            <div className="text-[13.5px] font-semibold text-[var(--fg-0)]">Get {amount} of free credits on Discord</div>
            <ol className="m-0 pl-[18px] flex flex-col gap-2 text-[13px] leading-[1.5] text-[var(--fg-1)]">
                <li>
                    <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline underline-offset-2">Join our Discord server</a>.
                </li>
                <li>
                    In any channel there, type this command for Marlow, our bot:
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-[12.5px] px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-0)] border border-[var(--line-2)] text-[var(--fg-0)] select-all break-all">{command}</code>
                        <button
                            type="button"
                            onClick={copy}
                            disabled={!code}
                            className="text-[12px] font-medium px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] disabled:opacity-50 transition-all duration-[120ms]"
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </li>
            </ol>
            <p className="m-0 text-[12px] leading-[1.5] text-[var(--fg-2)]">The credits arrive right away. The code is yours alone, and it works once.</p>
        </div>
    );
}
