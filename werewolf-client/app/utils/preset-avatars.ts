import { AvatarFraming, GAME_MASTER, ImageRect } from '@/app/api/game-models';
import { defaultFraming } from '@/app/utils/avatar-framing';

/**
 * Universal preset avatars (public/presets/): instant placeholders shown while a
 * game's themed art is still generating — faceless artist's mannequins in varied
 * poses, graphite pencil sketch on pure white, generated once by
 * scripts/generate-preset-avatars.ts. The white background is load-bearing: the
 * UI blends each preset over the bot's per-name gradient (getAvatarGradient)
 * with CSS multiply, so one monochrome pack yields a distinct color per bot.
 *
 * Allocation is a pure function of the game's bot list, so it is deterministic
 * (a bot keeps the same placeholder across renders, cinematic replays and
 * reloads) and unique within a game while the pool lasts (pose + color is how
 * players tell characters apart before the real portraits land).
 */

export const PRESET_POOL_SIZES = { male: 8, female: 8 } as const;

export const GM_PRESET_URL = '/presets/gm.webp';

/**
 * All presets on ONE sheet (public/presets/sheet.webp, built by
 * scripts/build-preset-sheet.mjs): the mannequin's "map", so a placeholder can
 * be reframed exactly like a drawn portrait. Cell order = male 1–8, female
 * 1–8, GM; 6 columns of 512px cells. Keep in sync with the build script.
 */
export const PRESET_SHEET_URL = '/presets/sheet.webp';
const PRESET_SHEET_COLS = 6;
const PRESET_SHEET_CELL = 512;
const PRESET_SHEET_ORDER = [
    ...Array.from({ length: PRESET_POOL_SIZES.male }, (_, i) => `/presets/male-${i + 1}.webp`),
    ...Array.from({ length: PRESET_POOL_SIZES.female }, (_, i) => `/presets/female-${i + 1}.webp`),
    GM_PRESET_URL,
];
export const PRESET_SHEET_SIZE = {
    width: PRESET_SHEET_COLS * PRESET_SHEET_CELL,
    height: Math.ceil(PRESET_SHEET_ORDER.length / PRESET_SHEET_COLS) * PRESET_SHEET_CELL,
};

/** The cell a single preset file occupies on the sheet. */
export function presetSheetCell(presetUrl: string): ImageRect | undefined {
    const i = PRESET_SHEET_ORDER.indexOf(presetUrl);
    if (i < 0) return undefined;
    return {
        left: (i % PRESET_SHEET_COLS) * PRESET_SHEET_CELL,
        top: Math.floor(i / PRESET_SHEET_COLS) * PRESET_SHEET_CELL,
        width: PRESET_SHEET_CELL,
        height: PRESET_SHEET_CELL,
    };
}

/** The mannequin's default framing on the sheet: the card that fits the
 * character's assigned preset cell, with the default circle. Undefined for
 * the human player (no preset). */
export function getPresetFraming(bots: Array<{ name: string; gender?: string }>, name: string): AvatarFraming | undefined {
    const url = getPresetAvatarUrl(bots, name);
    const cell = url ? presetSheetCell(url) : undefined;
    return cell ? defaultFraming(cell) : undefined;
}

const MALE_FILES = Array.from({ length: PRESET_POOL_SIZES.male }, (_, i) => `/presets/male-${i + 1}.webp`);
const FEMALE_FILES = Array.from({ length: PRESET_POOL_SIZES.female }, (_, i) => `/presets/female-${i + 1}.webp`);
// Neutral-gendered bots (robots, spirits, legacy docs without gender) draw from
// both pools — the mannequin is a placeholder, not a likeness, and color+pose
// carry the identity.
const ALL_FILES = [...MALE_FILES, ...FEMALE_FILES];

/** True for URLs from the preset pack — these render blended over the per-name
 *  gradient (CSS multiply), unlike generated portraits which render as-is. */
export function isPresetAvatarUrl(url: string): boolean {
    return url.startsWith('/presets/');
}

/** djb2 — stable across sessions, unlike anything Math.random-based. */
function hashName(name: string): number {
    let h = 5381;
    for (let i = 0; i < name.length; i++) {
        h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
    }
    return h;
}

function candidatesFor(gender: string | undefined): string[] {
    if (gender === 'male') return MALE_FILES;
    if (gender === 'female') return FEMALE_FILES;
    return ALL_FILES;
}

/**
 * Deterministically assigns a preset to every bot: walk the bot array in doc
 * order, hash the name into the bot's candidate pool, advance past files
 * already taken in this game (uniqueness is tracked per file across pools, so
 * a neutral bot never collides with a gendered one). Only when a pool is
 * exhausted do duplicates appear — and color still separates them.
 */
export function assignPresetAvatars(bots: Array<{ name: string; gender?: string }>): Map<string, string> {
    const used = new Set<string>();
    const assignments = new Map<string, string>();
    for (const bot of bots) {
        const candidates = candidatesFor(bot.gender);
        let idx = hashName(bot.name) % candidates.length;
        for (let step = 0; step < candidates.length && used.has(candidates[idx]); step++) {
            idx = (idx + 1) % candidates.length;
        }
        used.add(candidates[idx]);
        assignments.set(bot.name, candidates[idx]);
    }
    return assignments;
}

/**
 * Preset URL for a participant, or undefined for the human player
 * (no gender on record — the initial-letter avatar remains their fallback).
 */
export function getPresetAvatarUrl(
    bots: Array<{ name: string; gender?: string }>,
    name: string
): string | undefined {
    if (name === GAME_MASTER) return GM_PRESET_URL;
    if (!bots.some(b => b.name === name)) return undefined;
    return assignPresetAvatars(bots).get(name);
}
