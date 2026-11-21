import type {BrowserSignals} from "@/app/utils/browser-signals";

/**
 * Reads the browser signals (see browser-signals.ts) in the page. Client only. Every read
 * is wrapped: privacy browsers block or randomise some of these, and a missing value is a
 * value too. Never throws; returns whatever could be read, or null outside a browser.
 */

async function sha256Hex(text: string): Promise<string | undefined> {
    try {
        const bytes = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return undefined; // no SubtleCrypto (insecure origin): skip the hash
    }
}

async function canvasHash(): Promise<string | undefined> {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;
        // Text, curves and blending: the parts of 2D rendering that differ by GPU, driver,
        // font stack and engine.
        ctx.textBaseline = 'top';
        ctx.font = '16px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(100, 5, 80, 30);
        ctx.fillStyle = '#069';
        ctx.fillText('Werewolf, 人狼 \u{1F43A} 0.5', 4, 8);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Werewolf, 人狼 \u{1F43A} 0.5', 6, 26);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgb(255,0,255)';
        ctx.beginPath();
        ctx.arc(200, 30, 22, 0, Math.PI * 2, true);
        ctx.fill();
        return await sha256Hex(canvas.toDataURL());
    } catch {
        return undefined;
    }
}

function webgl(): {glVendor?: string; glRenderer?: string} {
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return {};
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        return {
            ...(typeof vendor === 'string' ? {glVendor: vendor} : {}),
            ...(typeof renderer === 'string' ? {glRenderer: renderer} : {}),
        };
    } catch {
        return {};
    }
}

/** Browser family and major version from the UA string, for browsers without client hints. */
function browserFromUserAgent(ua: string): {browser?: string; browserMajor?: number} {
    const rules: Array<[string, RegExp]> = [
        ['Edge', /Edg\/(\d+)/],
        ['Opera', /OPR\/(\d+)/],
        ['Firefox', /Firefox\/(\d+)/],
        ['Chrome', /Chrome\/(\d+)/],
        ['Safari', /Version\/(\d+).*Safari/],
    ];
    for (const [name, pattern] of rules) {
        const match = ua.match(pattern);
        if (match) return {browser: name, browserMajor: Number(match[1])};
    }
    return {};
}

async function platformAndBrowser(): Promise<Partial<BrowserSignals>> {
    const nav = navigator as Navigator & {userAgentData?: any};
    const out: Partial<BrowserSignals> = {};
    try {
        const data = nav.userAgentData;
        if (data) {
            if (typeof data.mobile === 'boolean') out.mobile = data.mobile;
            const high = await data.getHighEntropyValues?.(['platform', 'platformVersion']).catch(() => null);
            if (high?.platform) out.platform = high.platform;
            if (high?.platformVersion) out.platformVersion = high.platformVersion;
            const brand = (data.brands as Array<{brand: string; version: string}> | undefined)
                ?.find(b => !/not.?a.?brand/i.test(b.brand) && b.brand !== 'Chromium');
            if (brand) {
                out.browser = brand.brand;
                out.browserMajor = Number(brand.version) || undefined;
            }
        }
    } catch { /* fall through to the UA string */ }
    if (!out.platform && typeof nav.platform === 'string' && nav.platform) out.platform = nav.platform;
    if (!out.browser) Object.assign(out, browserFromUserAgent(nav.userAgent || ''));
    if (out.mobile === undefined) out.mobile = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent || '');
    return out;
}

export async function collectBrowserSignals(): Promise<BrowserSignals | null> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
    const signals: BrowserSignals = {};
    try {
        Object.assign(signals, webgl(), await platformAndBrowser());
        const canvas = await canvasHash();
        if (canvas) signals.canvas = canvas;
        if (window.screen) {
            signals.screenW = window.screen.width;
            signals.screenH = window.screen.height;
            signals.colorDepth = window.screen.colorDepth;
        }
        if (typeof window.devicePixelRatio === 'number') signals.dpr = Math.round(window.devicePixelRatio * 100) / 100;
        try { signals.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* no Intl */ }
        if (Array.isArray(navigator.languages) && navigator.languages.length > 0) signals.languages = [...navigator.languages];
        if (typeof navigator.hardwareConcurrency === 'number') signals.cores = navigator.hardwareConcurrency;
        const memory = (navigator as Navigator & {deviceMemory?: number}).deviceMemory;
        if (typeof memory === 'number') signals.memory = memory;
        if (typeof navigator.maxTouchPoints === 'number') signals.touchPoints = navigator.maxTouchPoints;
    } catch { /* keep what was read */ }
    return signals;
}
