import { assignPresetAvatars, getPresetAvatarUrl, isPresetAvatarUrl, PRESET_POOL_SIZES, GM_PRESET_URL } from './preset-avatars';
import { GAME_MASTER } from '@/app/api/game-models';
import { existsSync } from 'fs';
import path from 'path';

const bots = [
    { name: 'Alice', gender: 'female' },
    { name: 'Bob', gender: 'male' },
    { name: 'Clank', gender: 'neutral' },
    { name: 'Dora', gender: 'female' },
    { name: 'Edgar', gender: 'male' },
];

describe('preset avatar allocation', () => {
    it('is deterministic across calls', () => {
        const a = assignPresetAvatars(bots);
        const b = assignPresetAvatars(bots);
        expect(Object.fromEntries(a)).toEqual(Object.fromEntries(b));
    });

    it('assigns unique presets within a game while the pool lasts', () => {
        const urls = [...assignPresetAvatars(bots).values()];
        expect(new Set(urls).size).toBe(urls.length);
    });

    it('draws from the pool matching each bot gender', () => {
        const a = assignPresetAvatars(bots);
        expect(a.get('Alice')).toMatch(/^\/presets\/female-[1-8]\.webp$/);
        expect(a.get('Bob')).toMatch(/^\/presets\/male-[1-8]\.webp$/);
        // Neutral draws from either pool.
        expect(a.get('Clank')).toMatch(/^\/presets\/(male|female)-[1-8]\.webp$/);
    });

    it('treats missing gender as neutral (legacy game docs)', () => {
        const a = assignPresetAvatars([{ name: 'Old' }]);
        expect(a.get('Old')).toMatch(/^\/presets\/(male|female)-[1-8]\.webp$/);
    });

    it('keeps neutral bots from colliding with gendered assignments', () => {
        const crowd = [
            ...Array.from({ length: PRESET_POOL_SIZES.male }, (_, i) => ({ name: `M${i}`, gender: 'male' })),
            { name: 'Robot', gender: 'neutral' },
        ];
        const urls = [...assignPresetAvatars(crowd).values()];
        expect(new Set(urls).size).toBe(urls.length); // robot got a female-pool file
    });

    it('wraps to duplicates only once a pool is exhausted', () => {
        const many = Array.from({ length: PRESET_POOL_SIZES.male + 2 }, (_, i) => ({
            name: `M${i}`, gender: 'male',
        }));
        const urls = [...assignPresetAvatars(many).values()];
        expect(new Set(urls.slice(0, PRESET_POOL_SIZES.male)).size).toBe(PRESET_POOL_SIZES.male);
        expect(new Set(urls).size).toBe(PRESET_POOL_SIZES.male);
    });

    it('gives the GM its dedicated preset and the human player nothing', () => {
        expect(getPresetAvatarUrl(bots, GAME_MASTER)).toBe(GM_PRESET_URL);
        expect(getPresetAvatarUrl(bots, 'HumanPlayer')).toBeUndefined();
    });

    it('recognizes preset URLs', () => {
        expect(isPresetAvatarUrl('/presets/male-3.webp')).toBe(true);
        expect(isPresetAvatarUrl('/api/games/x/avatars/Bob?v=1')).toBe(false);
    });

    it('every referenced preset file exists in public/presets', () => {
        const dir = path.join(__dirname, '..', '..', 'public', 'presets');
        for (const [pool, size] of Object.entries(PRESET_POOL_SIZES)) {
            for (let i = 1; i <= size; i++) {
                expect(existsSync(path.join(dir, `${pool}-${i}.webp`))).toBe(true);
            }
        }
        expect(existsSync(path.join(dir, 'gm.webp'))).toBe(true);
    });
});
