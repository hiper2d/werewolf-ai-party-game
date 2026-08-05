import fs from 'fs';
import path from 'path';
import { TokenUsage } from '@/app/api/game-models';

/**
 * Collects per-model performance rows during live test runs (all-models.test.ts) and
 * emits a markdown table at the end: duration, tokens, cost, per scenario. The table is
 * printed to the console AND written to logs/live-perf-<timestamp>.md, so it survives
 * filtered/redirected test output.
 *
 * Cost is the tracked costUSD from each agent (cache-aware since 2026-08-04). Cached
 * tokens are already reflected in cost; they aren't a separate column because TokenUsage
 * doesn't carry them.
 */

interface PerfRow {
    scenario: string;
    model: string;
    ok: boolean;
    durationMs: number;
    usage?: TokenUsage;
}

const rows: PerfRow[] = [];

export function recordPerf(scenario: string, model: string, ok: boolean, durationMs: number, usage?: TokenUsage): void {
    rows.push({ scenario, model, ok, durationMs, usage });
}

/**
 * Wraps an agent call: times it, records the row (success or failure), rethrows on error.
 */
export async function withPerf<T extends [unknown, string, TokenUsage?, string?]>(
    scenario: string,
    model: string,
    call: () => Promise<T>
): Promise<T> {
    const start = Date.now();
    try {
        const result = await call();
        recordPerf(scenario, model, true, Date.now() - start, result[2]);
        return result;
    } catch (error) {
        recordPerf(scenario, model, false, Date.now() - start);
        throw error;
    }
}

function fmtDuration(ms: number): string {
    return ms >= 10000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 1000).toFixed(2)}s`;
}

function fmtCost(cost?: number): string {
    return cost === undefined ? '—' : `$${cost.toFixed(4)}`;
}

function fmtInt(n?: number): string {
    return n === undefined ? '—' : String(n);
}

export function buildPerfReport(): string {
    if (rows.length === 0) return '';

    const lines: string[] = [];
    lines.push(`# Live model performance — ${new Date().toISOString()}`);
    lines.push('');

    const scenarios = [...new Set(rows.map(r => r.scenario))];
    for (const scenario of scenarios) {
        const scenarioRows = rows.filter(r => r.scenario === scenario);
        lines.push(`## ${scenario}`);
        lines.push('');
        lines.push('| Model | OK | Time | Input | Output | Total | Cost |');
        lines.push('|---|---|---:|---:|---:|---:|---:|');
        // Sorted by duration so the table doubles as a speed grading.
        for (const r of [...scenarioRows].sort((a, b) => a.durationMs - b.durationMs)) {
            lines.push(
                `| ${r.model} | ${r.ok ? '✓' : '✗'} | ${fmtDuration(r.durationMs)} | ` +
                `${fmtInt(r.usage?.inputTokens)} | ${fmtInt(r.usage?.outputTokens)} | ` +
                `${fmtInt(r.usage?.totalTokens)} | ${fmtCost(r.usage?.costUSD)} |`
            );
        }
        const totalCost = scenarioRows.reduce((s, r) => s + (r.usage?.costUSD ?? 0), 0);
        const totalMs = scenarioRows.reduce((s, r) => s + r.durationMs, 0);
        lines.push(`| **total** | ${scenarioRows.filter(r => r.ok).length}/${scenarioRows.length} | ${fmtDuration(totalMs)} | | | | ${fmtCost(totalCost)} |`);
        lines.push('');
    }
    return lines.join('\n');
}

/**
 * Prints the table and writes it to logs/. Call from a top-level afterAll. Never throws —
 * a reporting failure must not fail the suite.
 */
export function writePerfReport(): void {
    try {
        const report = buildPerfReport();
        if (!report) return;

        // One console.log call so jest keeps the block together.
        console.log(`\n${report}`);

        const dir = path.join(process.cwd(), 'logs');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `live-perf-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
        fs.writeFileSync(file, report);
        console.log(`Perf report written to ${file}`);
    } catch (error) {
        console.warn('Failed to write perf report:', error);
    }
}
