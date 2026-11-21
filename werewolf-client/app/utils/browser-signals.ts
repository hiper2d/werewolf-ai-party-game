/**
 * Browser signals: what a browser tells any page about the machine it runs on. Collected
 * once per page load next to the device id (DeviceProvider → registerDevice) and stored on
 * the device record, so a browser that arrives with no id (cleared state, a private window,
 * a VPN) can later be recognised as one we have seen (docs/plan-multi-account-linking.md).
 *
 * MONITOR ONLY for now (2026-11-21): the values are stored and indexed, nothing is linked
 * or refused on them. They never leave this project and are not used to follow anyone
 * across sites.
 *
 * This module is shared by the client collector and the server: it holds the shape, the
 * sanitizer for what the client sends (client-supplied, so never trusted as is) and the two
 * keys derived from a vector. No DOM and no Node imports here.
 */
export interface BrowserSignals {
    /** SHA-256 of a small canvas drawing: varies with GPU, driver, OS and browser engine. */
    canvas?: string;
    /** Unmasked WebGL vendor and renderer (the graphics card as the driver names it). */
    glVendor?: string;
    glRenderer?: string;
    screenW?: number;
    screenH?: number;
    /** devicePixelRatio, rounded to two decimals. */
    dpr?: number;
    colorDepth?: number;
    /** OS family and version (UA client hints where available, else navigator.platform). */
    platform?: string;
    platformVersion?: string;
    /** Browser family and major version. */
    browser?: string;
    browserMajor?: number;
    /** The SYSTEM timezone (Intl), which a VPN does not change, unlike the IP's. */
    timezone?: string;
    languages?: string[];
    cores?: number;
    /** navigator.deviceMemory in GB (Chromium only). */
    memory?: number;
    touchPoints?: number;
    mobile?: boolean;
}

const STRING_KEYS = ['canvas', 'glVendor', 'glRenderer', 'platform', 'platformVersion', 'browser', 'timezone'] as const;
const NUMBER_KEYS = ['screenW', 'screenH', 'dpr', 'colorDepth', 'browserMajor', 'cores', 'memory', 'touchPoints'] as const;
const MAX_STRING = 160;
const MAX_LANGUAGES = 8;

/**
 * What the server keeps of a client-sent vector: known keys only, strings trimmed and cut,
 * numbers finite and in a sane range. Returns null when nothing usable is left (an old
 * client, a blocked API, garbage).
 */
export function sanitizeBrowserSignals(raw: unknown): BrowserSignals | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const input = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of STRING_KEYS) {
        const value = input[key];
        if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, MAX_STRING);
    }
    for (const key of NUMBER_KEYS) {
        const value = input[key];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000) {
            out[key] = Math.round(value * 100) / 100;
        }
    }
    if (Array.isArray(input.languages)) {
        const languages = input.languages
            .filter((v): v is string => typeof v === 'string' && !!v.trim())
            .map(v => v.trim().slice(0, 20))
            .slice(0, MAX_LANGUAGES);
        if (languages.length > 0) out.languages = languages;
    }
    if (typeof input.mobile === 'boolean') out.mobile = input.mobile;
    return Object.keys(out).length > 0 ? out as BrowserSignals : null;
}

function serialize(signals: BrowserSignals, keys: readonly (keyof BrowserSignals)[]): string {
    return keys.map(key => {
        const value = signals[key];
        return `${key}=${Array.isArray(value) ? value.join(',') : value ?? ''}`;
    }).join('|');
}

/** Every signal, in a fixed order: two page loads of one browser give the same string. */
export function fullSignalKey(signals: BrowserSignals): string {
    return serialize(signals, [
        'canvas', 'glVendor', 'glRenderer', 'screenW', 'screenH', 'dpr', 'colorDepth', 'platform', 'platformVersion',
        'browser', 'browserMajor', 'timezone', 'languages', 'cores', 'memory', 'touchPoints', 'mobile',
    ]);
}

/**
 * The machine, without the parts a browser update or another browser on the same machine
 * changes (canvas, browser family and version, OS version): graphics card, screen, OS family,
 * system timezone, languages, cores, memory. Two browsers on one computer share it; so do two
 * phones of one model in one timezone, which is why it only ever links and never refuses.
 */
export function machineSignalKey(signals: BrowserSignals): string {
    return serialize(signals, [
        'glVendor', 'glRenderer', 'screenW', 'screenH', 'dpr', 'colorDepth', 'platform',
        'timezone', 'languages', 'cores', 'memory', 'touchPoints', 'mobile',
    ]);
}

/** A vector with too little in it to tell machines apart (everything blocked or absent). */
export function isWeakSignalVector(signals: BrowserSignals): boolean {
    const strong = [signals.glRenderer, signals.canvas, signals.screenW && signals.screenH ? 'screen' : undefined, signals.timezone];
    return strong.filter(Boolean).length < 3;
}

export interface StoredFingerprint {
    /** sha256(fullSignalKey), hex. */
    hash: string;
    /** sha256(machineSignalKey), hex. */
    machineHash: string;
    signals: BrowserSignals;
    /** The edge's city and timezone for the IP at that moment: a system timezone that
     * disagrees with the IP's is the mark of a VPN. */
    geoCity?: string;
    ipTimezone?: string;
    firstSeenAt: number;
    seenAt: number;
}

/**
 * The device's fingerprint history with this sighting folded in: a vector seen before only
 * has its `seenAt` (and geo) refreshed, a new one is appended, and the list keeps the newest
 * `cap` distinct vectors, so a browser update does not erase what we match against.
 */
export function mergeFingerprint(list: unknown, sighting: StoredFingerprint, cap: number): StoredFingerprint[] {
    const current = Array.isArray(list) ? (list.filter(f => f && typeof f.hash === 'string') as StoredFingerprint[]) : [];
    const existing = current.find(f => f.hash === sighting.hash);
    const others = current.filter(f => f.hash !== sighting.hash);
    const merged: StoredFingerprint = existing
        ? {...existing, ...sighting, firstSeenAt: existing.firstSeenAt ?? sighting.firstSeenAt}
        : sighting;
    return [...others, merged].slice(-Math.max(1, cap));
}
