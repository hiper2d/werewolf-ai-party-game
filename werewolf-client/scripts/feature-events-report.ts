/**
 * Report over the feature-use events (`featureEvents`, written by app/api/feature-events.ts):
 * which deliberate player actions were taken, by how many people, in how many games.
 *
 *   1. Per feature: events, distinct users, distinct games. A voice_tts event is one
 *      spoken line, so its count is high by nature; read its users and games.
 *   2. Reach: of the games created in the window, how many had any avatar edit, a spoken
 *      line (clicked vs cinematic auto-read), a dictation; spoken lines by source; the
 *      per-user counts (who edits a lot — a power user or a crop that keeps coming out wrong).
 *   3. The rows themselves with --all (time, user, feature, game, detail).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/feature-events-report.ts [--days 7] [--all]
 */

import { db } from '../firebase/server';
import { listFeatureEventsSince, StoredFeatureEvent } from '../app/api/feature-events';

const argIdx = (flag: string) => process.argv.indexOf(flag);
const DAYS = argIdx('--days') > -1 ? parseInt(process.argv[argIdx('--days') + 1], 10) || 7 : 7;
const SHOW_ALL = argIdx('--all') > -1;

const when = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);

function countBy<T>(rows: T[], key: (row: T) => string | undefined): Map<string, number> {
    const out = new Map<string, number>();
    for (const row of rows) {
        const k = key(row);
        if (k === undefined) continue;
        out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
}

async function gamesCreatedSince(sinceMs: number): Promise<Set<string>> {
    if (!db) return new Set();
    const snapshot = await db.collection('games').where('createdAt', '>=', sinceMs).select('createdAt').get();
    return new Set(snapshot.docs.map(doc => doc.id));
}

async function main() {
    const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;
    const events = await listFeatureEventsSince(sinceMs);
    console.log(`Feature events since ${when(sinceMs)} UTC: ${events.length}`);
    if (events.length === 0) {
        console.log('(nothing recorded in the window)');
        return;
    }

    console.log('\n1. Per feature');
    const byFeature = new Map<string, StoredFeatureEvent[]>();
    for (const e of events) byFeature.set(e.feature, [...(byFeature.get(e.feature) ?? []), e]);
    for (const [feature, rows] of [...byFeature.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const users = new Set(rows.map(r => r.userId)).size;
        const games = new Set(rows.map(r => r.gameId).filter(Boolean)).size;
        console.log(`  ${feature.padEnd(24)} events ${String(rows.length).padStart(4)}   users ${String(users).padStart(3)}   games ${String(games).padStart(3)}`);
    }

    console.log('\n2. Reach');
    const created = await gamesCreatedSince(sinceMs);
    console.log(`  games created in window: ${created.size}`);
    const reach = (label: string, match: (e: StoredFeatureEvent) => boolean) => {
        const games = new Set(events.filter(e => match(e) && e.gameId).map(e => e.gameId!));
        const inWindow = [...games].filter(id => created.has(id)).length;
        console.log(`    with ${label.padEnd(28)} ${String(inWindow).padStart(4)}` +
            (created.size ? ` (${Math.round(100 * inWindow / created.size)}%)` : ''));
    };
    reach('any avatar edit', e => e.feature.startsWith('avatar_'));
    reach('any spoken line', e => e.feature === 'voice_tts');
    reach('a clicked spoken line', e => e.feature === 'voice_tts' && e.detail?.source !== 'cinematic_auto');
    reach('cinematic auto-read', e => e.feature === 'voice_tts' && e.detail?.source === 'cinematic_auto');
    reach('dictation', e => e.feature === 'voice_stt');
    const ttsSources = countBy(events.filter(e => e.feature === 'voice_tts'), e => String(e.detail?.source ?? 'chat'));
    if (ttsSources.size) {
        console.log('  spoken lines by source: ' + [...ttsSources.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', '));
    }
    const creations = events.filter(e => e.feature === 'game_created');
    if (creations.length) {
        console.log(`\n  choices on the new-game form (${creations.length} games):`);
        for (const field of ['voiceProvider', 'gameMode', 'longReplies', 'tier', 'artStyle', 'players', 'gameMaster']) {
            const counts = countBy(creations, e => String(e.detail?.[field] ?? '-'));
            const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(', ');
            console.log(`    ${field.padEnd(14)} ${parts}`);
        }
    }
    const perUser = countBy(events, e => e.userId);
    console.log('  per user:');
    for (const [user, n] of [...perUser.entries()].sort((a, b) => b[1] - a[1])) {
        const features = countBy(events.filter(e => e.userId === user), e => e.feature);
        const parts = [...features.entries()].map(([f, c]) => `${f} ${c}`).join(', ');
        console.log(`    ${user.padEnd(34)} ${String(n).padStart(4)}   ${parts}`);
    }

    if (SHOW_ALL) {
        console.log('\n3. Rows');
        for (const e of events) {
            console.log(`  ${when(e.createdAt)}  ${e.userId.padEnd(30)} ${e.feature.padEnd(22)} ${(e.gameId ?? '-').padEnd(40)} ${e.detail ? JSON.stringify(e.detail) : ''}`);
        }
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
});
