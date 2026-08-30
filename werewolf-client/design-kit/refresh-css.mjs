#!/usr/bin/env node
// Copies the Next production build's compiled stylesheet (Tailwind utilities +
// theme tokens + @font-face) and its font files into design-kit/static/ under
// stable names, preserving the chunks/../media relative layout so the
// design-sync converter can resolve and extract the fonts. Run after
// `npm run build`; the design-sync buildCmd chains both.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const chunks = 'werewolf-client/.next/static/chunks';
const media = 'werewolf-client/.next/static/media';
const outChunks = 'werewolf-client/design-kit/static/chunks';
const outMedia = 'werewolf-client/design-kit/static/media';

const css = readdirSync(chunks).filter(f => f.endsWith('.css'))
    .map(f => ({ f, size: statSync(join(chunks, f)).size }))
    .sort((a, b) => b.size - a.size)[0];
if (!css) { console.error('no compiled css in ' + chunks + ' — run the Next build first'); process.exit(1); }

rmSync('werewolf-client/design-kit/static', { recursive: true, force: true });
mkdirSync(outChunks, { recursive: true });
mkdirSync(outMedia, { recursive: true });
cpSync(join(chunks, css.f), join(outChunks, 'styles.css'));
for (const f of readdirSync(media)) {
    if (/\.(woff2?|ttf|otf)$/.test(f)) cpSync(join(media, f), join(outMedia, f));
}
console.log(`design-kit/static refreshed: ${css.f} (${(css.size / 1024).toFixed(0)}KB) + fonts`);
