import { appendCapped, appendSighting, IP_LINK_WINDOW_MS, pickLinkedDevice } from './device-utils';

describe('appendCapped', () => {
    it('appends and dedupes to the end, newest last', () => {
        expect(appendCapped(['a', 'b'], 'c', 5)).toEqual(['a', 'b', 'c']);
        expect(appendCapped(['a', 'b'], 'a', 5)).toEqual(['b', 'a']);
    });

    it('keeps only the newest `cap` entries', () => {
        expect(appendCapped(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
    });

    it('survives a missing or malformed field', () => {
        expect(appendCapped(undefined, 'a', 3)).toEqual(['a']);
        expect(appendCapped('not-an-array', 'a', 3)).toEqual(['a']);
        expect(appendCapped([1, null, 'b'], 'a', 3)).toEqual(['b', 'a']);
    });
});

describe('pickLinkedDevice', () => {
    const now = 1_000_000_000_000;
    const h = 60 * 60 * 1000;
    const sightings = [
        { deviceId: 'old', at: now - 20 * h, city: 'Gorham' },
        { deviceId: 'recent', at: now - 2 * h, city: 'Gorham' },
        { deviceId: 'newest-other-city', at: now - 1 * h, city: 'Portland' },
        { deviceId: 'no-city', at: now - 3 * h },
    ];

    it('adopts the newest device seen inside the window from the same city', () => {
        expect(pickLinkedDevice(sightings, now, 'Gorham')?.deviceId).toBe('recent');
    });

    it('ignores sightings older than the window', () => {
        expect(pickLinkedDevice([sightings[0]], now, 'Gorham')).toBeUndefined();
        expect(pickLinkedDevice([{ deviceId: 'edge', at: now - IP_LINK_WINDOW_MS }], now, undefined)?.deviceId).toBe('edge');
        expect(pickLinkedDevice([{ deviceId: 'edge', at: now - IP_LINK_WINDOW_MS - 1 }], now, undefined)).toBeUndefined();
    });

    it('treats a missing city on either side as compatible, a different city as not', () => {
        expect(pickLinkedDevice(sightings, now, undefined)?.deviceId).toBe('newest-other-city');
        expect(pickLinkedDevice([sightings[3]], now, 'Anywhere')?.deviceId).toBe('no-city');
        expect(pickLinkedDevice([sightings[2]], now, 'Gorham')).toBeUndefined();
    });

    it('never adopts a sighting from the future or a malformed entry', () => {
        expect(pickLinkedDevice([{ deviceId: 'future', at: now + 1 }], now, undefined)).toBeUndefined();
        expect(pickLinkedDevice([{ at: now }, 'junk', null, { deviceId: 5, at: now }], now, undefined)).toBeUndefined();
        expect(pickLinkedDevice(undefined, now, undefined)).toBeUndefined();
    });
});

describe('appendSighting', () => {
    it('keeps one entry per device, newest last, capped', () => {
        const a = { deviceId: 'a', at: 1 };
        const b = { deviceId: 'b', at: 2 };
        expect(appendSighting([a, b], { deviceId: 'a', at: 3 }, 5)).toEqual([b, { deviceId: 'a', at: 3 }]);
        expect(appendSighting([a, b], { deviceId: 'c', at: 3 }, 2)).toEqual([b, { deviceId: 'c', at: 3 }]);
        expect(appendSighting('junk', a, 2)).toEqual([a]);
    });
});
