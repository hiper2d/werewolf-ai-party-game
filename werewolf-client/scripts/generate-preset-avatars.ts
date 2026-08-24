/**
 * One-off generator for the universal preset avatar pack (public/presets/).
 *
 * Presets are the instant placeholders shown while a game's themed art is still
 * generating (~30-60s): faceless artist's mannequin figures in varied poses,
 * graphite pencil sketch on PURE WHITE. The white background is load-bearing:
 * the UI blends each preset over the bot's per-name gradient color with CSS
 * multiply, so one monochrome pack yields a distinct color per bot at runtime
 * (see preset-avatars.ts + PlayerAvatar). Faceless on purpose — they read as
 * "the artist hasn't drawn this character yet", so the swap to themed portraits
 * feels like an upgrade in any setting.
 *
 * Run with: npx tsx --env-file=.env scripts/generate-preset-avatars.ts
 * Re-running overwrites public/presets/. Curate by eye afterwards; rerun until happy.
 */

import { generateImage } from '../app/utils/avatar-generation';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const OUT_DIR = path.join(__dirname, '..', 'public', 'presets');

function gridPrompt(bodyForm: string, poses: string[]): string {
    return `A pose study sheet drawn as a single image: a precise grid of exactly 8 rectangular cells, 4 columns and 2 rows, all cells exactly equal size, separated by thin light divider lines. Each cell contains one half-figure (waist-up) drawing of a faceless artist's drawing mannequin with ${bodyForm}, each in a different pose, centered in its cell.

Style — graphite pencil sketch: loose expressive linework, visible construction lines, light hatching and shading, the featureless smooth head of a wooden drawing mannequin (no face, no eyes, no mouth). Every cell has a FLAT PURE WHITE background — no paper texture, no tone, no shadows cast on the background.

Row-major order, left to right, top to bottom:
${poses.map((p, i) => `Cell ${i + 1}: ${p}.`).join('\n')}

No text anywhere in the image.`;
}

const MALE_POSES = [
    'standing square to the viewer, arms crossed over the chest',
    'in profile facing left, head slightly bowed',
    'three-quarter view, one hand raised to where the chin would be, thinking',
    'leaning forward, both forearms resting on an unseen surface',
    'one arm raised mid-gesture as if making a point',
    'looking back over the left shoulder',
    'head tilted upward, arms relaxed at the sides',
    'both hands clasped behind the back, chest open',
];

const FEMALE_POSES = [
    'standing square to the viewer, hands clasped at the waist',
    'in profile facing right, chin lifted',
    'three-quarter view, one hand raised to where the chin would be, pensive',
    'arms crossed loosely, weight shifted to one side',
    'one hand raised in a calm open gesture',
    'looking back over the right shoulder',
    'head bowed slightly, hands folded together',
    'leaning forward with hands braced on an unseen surface',
];

const GM_PROMPT = `A single half-figure (waist-up) drawing of a faceless artist's drawing mannequin, centered: seated like a storyteller presiding over a table, both hands steepled, head level and composed. Graphite pencil sketch: loose expressive linework, visible construction lines, light hatching, the featureless smooth head of a wooden drawing mannequin (no face). FLAT PURE WHITE background — no paper texture, no tone. No text anywhere in the image.`;

async function main() {
    const apiKey = process.env.GOOGLE_K;
    if (!apiKey) throw new Error('GOOGLE_K not set');
    const sharp = (await import('sharp')).default;
    mkdirSync(OUT_DIR, { recursive: true });

    let totalCost = 0;

    for (const [pool, bodyForm, poses] of [
        ['male', 'a masculine body form (broad shoulders, straight torso)', MALE_POSES],
        ['female', 'a feminine body form (narrower shoulders, defined waist)', FEMALE_POSES],
    ] as Array<[string, string, string[]]>) {
        console.log(`Generating ${pool} grid...`);
        const image = await generateImage(apiKey, gridPrompt(bodyForm, poses), '4:3');
        totalCost += image.costUSD;

        const meta = await sharp(image.buffer).metadata();
        const cellW = Math.floor((meta.width || 0) / 4);
        const cellH = Math.floor((meta.height || 0) / 2);
        if (cellW < 100 || cellH < 100) throw new Error(`Grid ${pool} has unusable dimensions ${meta.width}x${meta.height}`);
        const inset = 8; // skip the divider lines

        for (let i = 0; i < 8; i++) {
            const webp = await sharp(image.buffer)
                .extract({ left: (i % 4) * cellW + inset, top: Math.floor(i / 4) * cellH + inset, width: cellW - 2 * inset, height: cellH - 2 * inset })
                .resize(512, 512, { fit: 'cover', position: 'top' })
                .webp({ quality: 82 })
                .toBuffer();
            writeFileSync(path.join(OUT_DIR, `${pool}-${i + 1}.webp`), webp);
            console.log(`  ${pool}-${i + 1}.webp (${Math.round(webp.length / 1024)}KB)`);
        }
    }

    console.log('Generating GM...');
    const gm = await generateImage(apiKey, GM_PROMPT, '1:1', { imageSize: '1K' });
    totalCost += gm.costUSD;
    const gmWebp = await sharp(gm.buffer).resize(512, 512, { fit: 'cover', position: 'top' }).webp({ quality: 82 }).toBuffer();
    writeFileSync(path.join(OUT_DIR, 'gm.webp'), gmWebp);
    console.log(`  gm.webp (${Math.round(gmWebp.length / 1024)}KB)`);

    console.log(`Done. Total cost: $${totalCost.toFixed(4)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
