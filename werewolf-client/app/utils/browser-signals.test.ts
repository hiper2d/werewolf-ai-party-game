import {
    BrowserSignals,
    fullSignalKey,
    isWeakSignalVector,
    machineSignalKey,
    mergeFingerprint,
    sanitizeBrowserSignals,
    StoredFingerprint,
} from "@/app/utils/browser-signals";

const laptop: BrowserSignals = {
    canvas: 'a'.repeat(64),
    glVendor: 'Google Inc. (Apple)',
    glRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
    screenW: 1728, screenH: 1117, dpr: 2, colorDepth: 30,
    platform: 'macOS', platformVersion: '15.5.0',
    browser: 'Google Chrome', browserMajor: 142,
    timezone: 'America/Los_Angeles', languages: ['en-US', 'en'],
    cores: 12, memory: 8, touchPoints: 0, mobile: false,
};

describe('sanitizeBrowserSignals', () => {
    it('keeps a well-formed vector as is', () => {
        expect(sanitizeBrowserSignals(laptop)).toEqual(laptop);
    });

    it('drops unknown keys, wrong types and out-of-range numbers', () => {
        expect(sanitizeBrowserSignals({
            canvas: 42, glRenderer: '  Mali-G78  ', screenW: -5, screenH: Infinity, cores: 8,
            languages: ['en', 7, ''], mobile: 'yes', __proto__: {x: 1}, extra: 'x', nested: {a: 1},
        })).toEqual({glRenderer: 'Mali-G78', cores: 8, languages: ['en']});
    });

    it('cuts long strings and long language lists', () => {
        const out = sanitizeBrowserSignals({glRenderer: 'x'.repeat(1000), languages: Array(50).fill('en')})!;
        expect(out.glRenderer).toHaveLength(160);
        expect(out.languages).toHaveLength(8);
    });

    it('returns null for nothing usable', () => {
        for (const raw of [null, undefined, 'x', 3, [], {}, {foo: 1}]) {
            expect(sanitizeBrowserSignals(raw)).toBeNull();
        }
    });
});

describe('signal keys', () => {
    it('are stable for the same vector whatever the key order', () => {
        const reordered = Object.fromEntries(Object.entries(laptop).reverse()) as BrowserSignals;
        expect(fullSignalKey(reordered)).toBe(fullSignalKey(laptop));
        expect(machineSignalKey(reordered)).toBe(machineSignalKey(laptop));
    });

    it('machine key survives a browser update, another browser and an OS update', () => {
        const updated: BrowserSignals = {...laptop, browser: 'Firefox', browserMajor: 150, canvas: 'b'.repeat(64), platformVersion: '15.6.0'};
        expect(machineSignalKey(updated)).toBe(machineSignalKey(laptop));
        expect(fullSignalKey(updated)).not.toBe(fullSignalKey(laptop));
    });

    it('machine key changes with the hardware or the system timezone', () => {
        expect(machineSignalKey({...laptop, glRenderer: 'ANGLE (NVIDIA RTX 4070)'})).not.toBe(machineSignalKey(laptop));
        expect(machineSignalKey({...laptop, timezone: 'Europe/Berlin'})).not.toBe(machineSignalKey(laptop));
        expect(machineSignalKey({...laptop, screenW: 1920})).not.toBe(machineSignalKey(laptop));
    });
});

describe('isWeakSignalVector', () => {
    it('accepts a normal vector and rejects a blocked one', () => {
        expect(isWeakSignalVector(laptop)).toBe(false);
        expect(isWeakSignalVector({timezone: 'UTC', languages: ['en'], cores: 4})).toBe(true);
        expect(isWeakSignalVector({screenW: 1920, screenH: 1080, timezone: 'UTC'})).toBe(true);
        expect(isWeakSignalVector({screenW: 1920, screenH: 1080, timezone: 'UTC', glRenderer: 'x'})).toBe(false);
    });
});

describe('mergeFingerprint', () => {
    const fp = (hash: string, at: number): StoredFingerprint => ({hash, machineHash: 'm', signals: laptop, firstSeenAt: at, seenAt: at});

    it('appends a new vector and refreshes a known one without losing when it was first seen', () => {
        let list = mergeFingerprint(undefined, fp('a', 1), 5);
        list = mergeFingerprint(list, fp('b', 2), 5);
        list = mergeFingerprint(list, {...fp('a', 9), geoCity: 'Lisbon'}, 5);
        expect(list.map(f => f.hash)).toEqual(['b', 'a']);
        expect(list[1]).toMatchObject({firstSeenAt: 1, seenAt: 9, geoCity: 'Lisbon'});
    });

    it('keeps the newest `cap` distinct vectors and ignores junk', () => {
        let list: StoredFingerprint[] = mergeFingerprint(['junk', null, {nope: 1}], fp('a', 1), 2);
        list = mergeFingerprint(list, fp('b', 2), 2);
        list = mergeFingerprint(list, fp('c', 3), 2);
        expect(list.map(f => f.hash)).toEqual(['b', 'c']);
    });
});
