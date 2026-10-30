/**
 * Fills the game text locales (app/ai/game-text/locales/<code>.json) from the English source
 * (app/ai/game-text/en.ts) with a strong model, then validates every line the way the
 * locale test does. Run it after adding or editing an English line; the test tells you to.
 *
 * By default it translates only what the test would flag: keys missing from a file, and keys
 * whose stored source hash no longer matches the English line. Existing good lines are kept,
 * so a hand edit of a JSON survives a re-run.
 *
 *   npx tsx --env-file=.env scripts/translate-game-text.ts                 # all languages, missing + stale keys
 *   npx tsx --env-file=.env scripts/translate-game-text.ts --language zh,ja
 *   npx tsx --env-file=.env scripts/translate-game-text.ts --force         # re-translate everything
 *   npx tsx --env-file=.env scripts/translate-game-text.ts --dry-run       # print, write nothing
 *   npx tsx --env-file=.env scripts/translate-game-text.ts --model CLAUDE_SONNET
 *
 * Cost: a whole language is one call of ~3k output tokens; all 13 on Opus is under a dollar.
 * The platform keys come from Firestore (config/freeTierApiKeys), so the sandbox must be off.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { getFreeTierApiKeys } from '../app/api/free-tier-actions';
import { AgentFactory } from '../app/ai/agent-factory';
import { configureStoryAgent, LLM_CONSTANTS } from '../app/ai/ai-models';
import { GAME_LANGUAGES, gameLanguageName } from '../app/ai/game-language';
import { GAME_TEXT_EN, GAME_TEXT_KEYS, lineHash, placeholdersOf, type GameTextKey } from '../app/ai/game-text/en';
import type { GameTextLocale } from '../app/ai/game-text/locales';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; };
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');
const MODEL_KEY = flag('--model') ?? 'CLAUDE_OPUS';
const LANGUAGES = (flag('--language')?.split(',').map(s => s.trim()).filter(Boolean))
    ?? GAME_LANGUAGES.map(l => l.code).filter(code => code !== 'en');
const LOCALES_DIR = join(__dirname, '..', 'app', 'ai', 'game-text', 'locales');

const SYSTEM_PROMPT = `\
You translate the fixed lines a Werewolf party game's Game Master posts in the chat: phase headers, vote results, role reveals, rule reminders. Players read your lines as the game's own voice, so they must read as if written by a native game master, not translated.

Rules:
- Natural, idiomatic, the register of a game master addressing players. Not a word-for-word gloss.
- Keep every {placeholder} exactly as it is (same spelling, same braces). It is filled at runtime with a player's name, a number or a role name. Every placeholder of the English line must appear exactly once in yours.
- vote_line_one and vote_line_many differ only in grammatical number. In a language where a count takes no plural form (Chinese, Japanese, Korean, Turkish after a numeral) translate both to the same text — and keep {count} in both; never replace it with a numeral or a word.
- Keep the emoji and the markdown markers (**bold**, *italics*, • bullets, line breaks) in place.
- Role names: use the term that language's own edition of the Werewolf game uses for the werewolf, the doctor, the detective, the maniac and the villager, and use the same term for a role in every line. Be careful with neighbouring languages: the Chinese term is 狼人 and the Japanese is 人狼 — never mix them.
- Return a JSON object with exactly the requested keys, each value the translated line. No extra keys, no commentary.`;

function readLocale(code: string): GameTextLocale {
    const file = join(LOCALES_DIR, `${code}.json`);
    if (!existsSync(file)) return { language: code, lines: {}, sources: {} };
    return JSON.parse(readFileSync(file, 'utf8')) as GameTextLocale;
}

function writeLocale(locale: GameTextLocale): void {
    // Keys in English-source order so diffs read top to bottom.
    const ordered = (map: Partial<Record<GameTextKey, string>>) =>
        Object.fromEntries(GAME_TEXT_KEYS.filter(key => key in map).map(key => [key, map[key]]));
    const body = { language: locale.language, lines: ordered(locale.lines), sources: ordered(locale.sources) };
    writeFileSync(join(LOCALES_DIR, `${locale.language}.json`), JSON.stringify(body, null, 2) + '\n');
}

function keysToTranslate(locale: GameTextLocale): GameTextKey[] {
    if (FORCE) return [...GAME_TEXT_KEYS];
    return GAME_TEXT_KEYS.filter(key => {
        const line = locale.lines[key];
        const current = typeof line === 'string' && line.trim() !== '' && placeholdersOf(line).join(',') === placeholdersOf(GAME_TEXT_EN[key]).join(',');
        return !current || locale.sources[key] !== lineHash(GAME_TEXT_EN[key]);
    });
}

async function translate(code: string, keys: GameTextKey[], apiKeys: Record<string, string>): Promise<Partial<Record<GameTextKey, string>>> {
    const model = (LLM_CONSTANTS as Record<string, string>)[MODEL_KEY];
    if (!model) throw new Error(`Unknown model constant ${MODEL_KEY}`);
    const agent = AgentFactory.createAgent('Game Master', SYSTEM_PROMPT, model, apiKeys, false);
    agent.userId = 'hiper2d@gmail.com';
    configureStoryAgent(agent);
    const schema = z.object(Object.fromEntries(keys.map(key => [key, z.string()])) as Record<string, z.ZodString>);
    const requested = Object.fromEntries(keys.map(key => [key, GAME_TEXT_EN[key]]));
    const context = Object.fromEntries(GAME_TEXT_KEYS.filter(key => !keys.includes(key)).map(key => [key, GAME_TEXT_EN[key]]));
    const [raw, , usage] = await agent.askWithZodSchema(schema, [{
        role: 'user',
        content: `Translate into ${gameLanguageName(code)}.\n\nLines to translate (English):\n${JSON.stringify(requested, null, 2)}` +
            (Object.keys(context).length ? `\n\nThe other lines of the same set, for consistency of terms (do NOT return these):\n${JSON.stringify(context, null, 2)}` : ''),
    }]);
    console.log(`  ${code}: ${keys.length} lines, $${usage?.costUSD?.toFixed(4) ?? '?'}, ${usage?.outputTokens ?? '?'} out`);
    return raw as Partial<Record<GameTextKey, string>>;
}

async function main() {
    const unknown = LANGUAGES.filter(code => !GAME_LANGUAGES.some(l => l.code === code) || code === 'en');
    if (unknown.length) throw new Error(`Not a non-English game language: ${unknown.join(', ')}`);
    let apiKeys: Record<string, string> | undefined;
    let problems = 0;

    for (const code of LANGUAGES) {
        const locale = readLocale(code);
        const keys = keysToTranslate(locale);
        if (keys.length === 0) {
            console.log(`  ${code}: up to date`);
            continue;
        }
        apiKeys ??= await getFreeTierApiKeys();
        const translated = await translate(code, keys, apiKeys);
        for (const key of keys) {
            const line = translated[key];
            const ok = typeof line === 'string' && line.trim() !== '' && placeholdersOf(line).join(',') === placeholdersOf(GAME_TEXT_EN[key]).join(',');
            if (!ok) {
                problems++;
                console.log(`  ${code}: REJECTED ${key} -> ${JSON.stringify(line)} (placeholders ${placeholdersOf(GAME_TEXT_EN[key]).join(',') || 'none'} expected)`);
                continue;
            }
            locale.lines[key] = line.trim();
            locale.sources[key] = lineHash(GAME_TEXT_EN[key]);
        }
        if (DRY) {
            for (const key of keys) console.log(`    ${key}: ${locale.lines[key]}`);
        } else {
            writeLocale(locale);
        }
    }
    if (problems) {
        console.log(`\n${problems} line(s) rejected — run again for those keys (they are still missing) or edit the JSON by hand.`);
        process.exit(1);
    }
    console.log(DRY ? '\n(dry run, nothing written)' : '\nDone. Run `npx jest app/ai/game-text` to confirm every locale is complete.');
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
