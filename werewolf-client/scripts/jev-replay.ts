/**
 * Replay a recorded Jev router call against the CURRENT selection logic.
 *
 * Every router call is logged to Better Stack as `Agent jev_router: Game Master (jev-…)`
 * with the full state (history[0].content), the questions (command), the raw answers and
 * the decision (reply.raw). Pull one row and feed it here to see what today's
 * composeSpeakerSet / JEV_ROUTER_CONFIG would decide for the same answers — or re-ask Jev
 * with the same state to see whether the model's answers moved.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/jev-replay.ts --game <gameId>            # list the game's recorded calls
 *   npx tsx --env-file=.env scripts/jev-replay.ts --game <gameId> --last     # replay the latest one
 *   npx tsx --env-file=.env scripts/jev-replay.ts --doc <recordId> [--ask]   # replay one Firestore record
 *   npx tsx --env-file=.env scripts/jev-replay.ts <record.json> [--ask]      # replay a saved JSON record
 *
 * Records live in the Firestore collection `jevRouterCalls` (one doc per call, written by
 * app/api/jev-records.ts). <record.json> may also be a raw Better Stack log line
 * (history/command/reply) or a plain { state, questions, answers? } object copied from the
 * dev console. --ask re-sends the recorded state + questions to Jev (needs TYPESAFE_API_KEY
 * or J_K in .env) and composes from the fresh answers instead of the recorded ones.
 */

import fs from 'node:fs';
import { askJev, JevQuestion } from '../app/ai/jev-client';
import { composeSpeakerSet, JEV_ROUTER_CONFIG, SpeakerSignal } from '../app/api/jev-router';
import { getJevRouterCall, listJevRouterCalls } from '../app/api/jev-records';

interface RouterRecord {
    state: any;
    questions: Record<string, JevQuestion>;
    answers?: Record<string, any>;
    decision?: any;
}

function loadRecord(path: string): RouterRecord {
    const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    // Better Stack row (or its `raw` field, if the row was saved whole).
    const row = typeof raw.raw === 'string' ? JSON.parse(raw.raw) : raw;
    if (row.history && row.command) {
        const reply = row.reply?.raw ?? row.reply ?? {};
        return {
            state: JSON.parse(row.history[0].content),
            questions: JSON.parse(row.command),
            answers: reply.answers,
            decision: reply.decision,
        };
    }
    if (row.state && row.questions) {
        return { state: row.state, questions: row.questions, answers: row.answers, decision: row.decision };
    }
    throw new Error('Unrecognised record: expected a Better Stack jev_router row or { state, questions, answers? }');
}

function compose(record: RouterRecord, answers: Record<string, any>) {
    const candidates: string[] = record.state.bots;
    const quietChoice = answers.quiet_pick;
    const legacyChoice = answers.next_speaker; // records from before the per-bot reply score
    const signals: SpeakerSignal[] = candidates.map(name => {
        const reply = answers[`reply_${name}`];
        const quietRelevance = Number(quietChoice?.probabilities?.[name]) || 0;
        if (reply) {
            const levels = Object.keys(reply.probabilities ?? {});
            const top = levels.length ? levels[levels.length - 1] : '3';
            return { name, score: Number(reply.score) || 0, mustReply: Number(reply.probabilities?.[top]) || 0, quietRelevance };
        }
        // Legacy shape: choice share scaled onto the 0–3 score, addressed noul as the must signal.
        const probability = Number(legacyChoice?.probabilities?.[name]) || 0;
        const addressed = Number(answers[`addressed_${name}`]?.noul) || 0;
        return { name, score: probability * 3, mustReply: Math.max(addressed, probability), quietRelevance };
    });
    const lastAuthor: string | null = record.decision?.lastAuthor
        ?? (typeof record.state.latest_message === 'string' ? record.state.latest_message.split(':')[0] : null);
    const activity: Record<string, number> = record.decision?.activity ?? {};
    return composeSpeakerSet({ signals, activity, lastAuthor });
}

function argValue(flag: string): string | undefined {
    const idx = process.argv.indexOf(flag);
    return idx > -1 ? process.argv[idx + 1] : undefined;
}

async function loadFromFirestore(): Promise<RouterRecord | null> {
    const docId = argValue('--doc');
    if (docId) {
        const doc = await getJevRouterCall(docId);
        if (!doc) throw new Error(`No jevRouterCalls doc ${docId}`);
        console.log(`record ${doc.id}: game ${doc.gameId}, day ${doc.day}, ${new Date(doc.createdAt).toISOString()}, status ${doc.status}${doc.error ? ` (${doc.error})` : ''}`);
        return { state: doc.state, questions: doc.questions as Record<string, JevQuestion>, answers: doc.answers, decision: doc.decision };
    }
    const gameId = argValue('--game');
    if (gameId) {
        const calls = await listJevRouterCalls(gameId);
        console.log(`${calls.length} recorded router calls for game ${gameId}`);
        for (const c of calls) {
            const d: any = c.decision ?? {};
            console.log(`  ${c.id}  day ${c.day}  ${new Date(c.createdAt).toISOString()}  ${c.status.padEnd(5)}  ${c.durationMs ?? '-'} ms  selected [${(d.selected ?? []).join(', ')}]${c.error ? `  ${c.error}` : ''}`);
        }
        if (!process.argv.includes('--last')) return null;
        const last = [...calls].reverse().find(c => c.status === 'ok');
        if (!last) throw new Error('No successful call to replay');
        console.log(`\nreplaying ${last.id}`);
        return { state: last.state, questions: last.questions as Record<string, JevQuestion>, answers: last.answers, decision: last.decision };
    }
    return null;
}

async function main() {
    const ask = process.argv.includes('--ask');
    const fromDb = await loadFromFirestore();
    if (fromDb === null && (argValue('--game') || argValue('--doc'))) {
        return; // --game without --last: listing only
    }
    const path = process.argv[2];
    if (!fromDb && (!path || path.startsWith('--'))) {
        console.error('Usage: scripts/jev-replay.ts (--game <gameId> [--last] | --doc <id> | <record.json>) [--ask]');
        process.exit(1);
    }
    const record = fromDb ?? loadRecord(path);
    console.log(`state: ${record.state.bots?.length ?? '?'} bots, ${record.state.discussion?.length ?? '?'} discussion lines, quiet pool [${(record.state.quiet_bots ?? []).join(', ')}]`);
    console.log(`config now: ${JSON.stringify(JEV_ROUTER_CONFIG)}`);
    if (record.decision) {
        console.log(`recorded decision: ${JSON.stringify({ selected: record.decision.selected, must: record.decision.must, quiet: record.decision.quiet, target: record.decision.target, dramatic: record.decision.dramatic })}`);
        if (record.decision.config) console.log(`recorded config:   ${JSON.stringify(record.decision.config)}`);
    }

    let answers = record.answers;
    if (ask) {
        const key = process.env.TYPESAFE_API_KEY || process.env.J_K;
        if (!key) throw new Error('--ask needs TYPESAFE_API_KEY or J_K in the env');
        const result = await askJev(key, record.state, record.questions);
        console.log(`re-asked Jev: ${result.model}, ${result.durationMs} ms, ${result.inputTokens} tokens`);
        if (record.answers) {
            for (const [q, a] of Object.entries(result.answers as Record<string, any>)) {
                const before = record.answers[q];
                const nowV = a.choice ?? a.noul?.toFixed(2);
                const wasV = before?.choice ?? before?.noul?.toFixed(2);
                if (String(nowV) !== String(wasV)) console.log(`  ${q}: ${wasV} → ${nowV}`);
            }
        }
        answers = result.answers;
    }
    if (!answers) throw new Error('No answers in the record; run with --ask to query Jev');

    const ranking = answers.next_speaker
        ? Object.entries(answers.next_speaker.probabilities ?? {})
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([n, p]: any) => `${n} ${(p * 100).toFixed(0)}%`).join(', ')
        : (record.state.bots as string[])
            .map(n => ({ n, a: answers[`reply_${n}`] }))
            .filter(x => x.a)
            .sort((x, y) => y.a.score - x.a.score)
            .map(({ n, a }) => `${n} ${Number(a.score).toFixed(2)}`).join(', ');
    console.log(`answers: ${answers.next_speaker ? 'next_speaker (legacy)' : 'reply scores'} ${ranking}; dramatic ${Number(answers.dramatic?.noul ?? 0).toFixed(2)}`);

    // Several runs: the count and tie-breaks are random by design.
    for (let i = 0; i < 3; i++) {
        const out = compose(record, answers);
        console.log(`replay ${i + 1}: selected [${out.selected.join(', ')}]  must [${out.must.join(', ')}]  quiet [${out.quiet.join(', ')}]  target ${out.target}`);
    }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
