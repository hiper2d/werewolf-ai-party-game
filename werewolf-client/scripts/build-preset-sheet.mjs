// Composes the preset mannequin files (public/presets/*.webp) into ONE sheet,
// public/presets/sheet.webp, so a mannequin can be reframed like a drawn
// portrait: the sheet is the mannequin's "map". Cell order is fixed and
// mirrored by PRESET_SHEET in app/utils/preset-avatars.ts — rerun this script
// AND update that constant together if the pack changes.
//   node scripts/build-preset-sheet.mjs
import sharp from 'sharp';
import path from 'path';
import {fileURLToPath} from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'presets');
const files = [
    ...Array.from({length: 8}, (_, i) => `male-${i + 1}`),
    ...Array.from({length: 8}, (_, i) => `female-${i + 1}`),
    'gm',
];
const COLS = 6, CELL = 512;
const rows = Math.ceil(files.length / COLS);
const composites = [];
for (let i = 0; i < files.length; i++) {
    composites.push({
        input: await sharp(path.join(dir, `${files[i]}.webp`)).resize(CELL, CELL, {fit: 'cover'}).toBuffer(),
        left: (i % COLS) * CELL,
        top: Math.floor(i / COLS) * CELL,
    });
}
const out = path.join(dir, 'sheet.webp');
await sharp({create: {width: COLS * CELL, height: rows * CELL, channels: 3, background: '#ffffff'}})
    .composite(composites)
    .webp({quality: 82})
    .toFile(out);
const meta = await sharp(out).metadata();
console.log(`${out}: ${meta.width}x${meta.height}, ${files.length} cells of ${CELL}px in ${COLS} columns`);
