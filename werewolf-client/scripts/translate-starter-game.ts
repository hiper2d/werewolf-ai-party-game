/**
 * Translates a starter template (docs/plan-growth-roadmap.md, track 1) so the story can be
 * started in another language: the opening story, each character's backstory and each
 * introduction, written to starterGames/{id}/locales/{code} (StarterLocale). A game dealt
 * in that language is an ordinary game with `language` set, so everything after the
 * introductions is written by the models in that language.
 *
 * Not translated: names (identifiers and portrait keys), play styles, voice and picture
 * directions (prompts), the card's title and hook (app chrome).
 *
 * By default only what is missing or stale (the English changed since) is translated, so a
 * hand edit of a locale survives a re-run.
 *
 *   npx tsx --env-file=.env scripts/translate-starter-game.ts <templateId>                # every language
 *   npx tsx --env-file=.env scripts/translate-starter-game.ts <templateId> --language ru,ja
 *   npx tsx --env-file=.env scripts/translate-starter-game.ts <templateId> --force       # translate everything again
 *   npx tsx --env-file=.env scripts/translate-starter-game.ts <templateId> --dry-run     # print, write nothing
 *   npx tsx --env-file=.env scripts/translate-starter-game.ts <templateId> --show ru     # print a stored translation
 *
 * Then record the voices: record-starter-voices.ts <templateId> --language all
 * Cost: one call per language, roughly $0.15 on Opus. Sandbox off (keys come from Firestore).
 */
import { z } from 'zod';
import { db } from '../firebase/server';
import { getFreeTierApiKeys } from '../app/api/free-tier-actions';
import { AgentFactory } from '../app/ai/agent-factory';
import { configureStoryAgent, LLM_CONSTANTS } from '../app/ai/ai-models';
import { GAME_LANGUAGES, gameLanguageName } from '../app/ai/game-language';
import {
    mentionsPlaceholder,
    replacePlaceholderName,
    staleStarterLocalePieces,
    STARTER_GAMES_COLLECTION,
    STARTER_LOCALES_COLLECTION,
    STARTER_PLAYER_TOKEN,
    StarterLocale,
    starterLocalePieces,
    StarterTemplate,
    starterTextHash,
} from '../app/utils/starter-games';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; };
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');
const MODEL_KEY = flag('--model') ?? 'CLAUDE_OPUS';
const CONCURRENCY = 2; // four at once ran three of thirteen past the 240 s story timeout

const SYSTEM_PROMPT = `\
You translate the opening of a Werewolf party game: the scene the Game Master reads aloud, each character's backstory, and each character's spoken introduction at the table. Players read and HEAR your text (it is recorded by voice actors), so it must sound as if a native author wrote it, not like a translation.

Rules:
- Natural, idiomatic prose. Keep each character's voice: a gruff smith stays gruff, a nervous clerk stays nervous. Introductions are speech, in the first person, in the register that character would use.
- Character names are identifiers. Copy every name letter for letter, in Latin letters exactly as given: never translated, transliterated, declined, inflected or given a title. Build the sentence so the bare name fits (in languages with cases, prefer constructions where the name can stand uninflected).
- ${STARTER_PLAYER_TOKEN} stands for the human player's name, filled in at runtime. Keep it exactly as written, wherever the English has it, and never add it where the English does not.
- Keep the paragraph breaks and any markdown (*italics*, **bold**).
- Role words: use the terms this language's own edition of the Werewolf game uses (werewolf, villager, doctor, detective). The Chinese term is 狼人 and the Japanese is 人狼: never mix them.
- Do not add, drop or soften content. Same facts, same length within reason.
- Return a JSON object with exactly the requested keys, each value the translated text. No commentary.`;

function splitKey(key: string): [string | undefined, 'story' | 'intro'] {
    if (key === 'story') return [undefined, 'story'];
    const dot = key.lastIndexOf('.');
    return [key.slice(0, dot), key.slice(dot + 1) as 'story' | 'intro'];
}

async function translate(template: StarterTemplate, code: string, keys: string[], apiKeys: Record<string, string>): Promise<Record<string, string>> {
    const model = (LLM_CONSTANTS as Record<string, string>)[MODEL_KEY];
    if (!model) throw new Error(`Unknown model constant ${MODEL_KEY}`);
    const agent = AgentFactory.createAgent('Game Master', SYSTEM_PROMPT, model, apiKeys, false);
    agent.userId = 'hiper2d@gmail.com';
    configureStoryAgent(agent);
    // The human's name becomes the token before the model sees the text.
    const english = Object.fromEntries(Object.entries(starterLocalePieces(template))
        .map(([key, text]) => [key, replacePlaceholderName(text, template.humanPlaceholder, STARTER_PLAYER_TOKEN)]));
    // Schema keys p0, p1, …: piece keys hold names in any script and a dot.
    const ids = Object.fromEntries(keys.map((key, index) => [`p${index}`, key]));
    const schema = z.object(Object.fromEntries(Object.keys(ids).map(id => [id, z.string()])) as Record<string, z.ZodString>);
    const describe = (key: string) => {
        const [name, field] = splitKey(key);
        return name === undefined ? 'The opening scene, read aloud by the Game Master' : field === 'story' ? `${name}'s backstory (third person)` : `${name}'s spoken introduction at the table (first person)`;
    };
    const requested = Object.fromEntries(Object.entries(ids).map(([id, key]) => [id, {what: describe(key), text: english[key]}]));
    const context = Object.fromEntries(Object.entries(english).filter(([key]) => !keys.includes(key)).map(([key, text]) => [describe(key), text]));
    const names = template.bots.map(b => b.name).join(', ');
    const [raw, , usage] = await agent.askWithZodSchema(schema, [{
        role: 'user',
        content: `Translate into ${gameLanguageName(code)}.\n\nSetting: ${template.theme}\nCharacter names (copy letter for letter): ${names}\n\n` +
            `Texts to translate (English):\n${JSON.stringify(requested, null, 2)}` +
            (Object.keys(context).length ? `\n\nThe rest of the same opening, for consistency (do NOT return these):\n${JSON.stringify(context, null, 2)}` : ''),
    }]);
    console.log(`  ${code}: ${keys.length} piece(s), $${usage?.costUSD?.toFixed(4) ?? '?'}, ${usage?.outputTokens ?? '?'} out`);
    return Object.fromEntries(Object.entries(ids).map(([id, key]) => [key, String((raw as Record<string, string>)[id] ?? '').trim()]));
}

/** Why a translated piece cannot be used, or null. */
function problemWith(template: StarterTemplate, key: string, englishWithToken: string, translated: string): string | null {
    if (!translated) return 'empty';
    const count = (text: string) => text.split(STARTER_PLAYER_TOKEN).length - 1;
    if (count(translated) !== count(englishWithToken)) return `${STARTER_PLAYER_TOKEN} appears ${count(translated)}x, the English has it ${count(englishWithToken)}x`;
    for (const bot of template.bots) {
        if (mentionsPlaceholder(englishWithToken, bot.name) && !translated.includes(bot.name)) return `the name ${bot.name} is missing or was changed`;
    }
    return null;
}

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const templateId = args[0];
    if (!templateId || templateId.startsWith('--')) {
        console.error('Usage: translate-starter-game.ts <templateId> [--language ru,ja] [--force] [--dry-run] [--show <code>]');
        process.exit(1);
    }
    const ref = db.collection(STARTER_GAMES_COLLECTION).doc(templateId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error(`No starter template "${templateId}"`);
    const template = {...(doc.data() as Omit<StarterTemplate, 'id'>), id: doc.id};
    const localesRef = ref.collection(STARTER_LOCALES_COLLECTION);

    const show = flag('--show');
    if (show) {
        const locale = (await localesRef.doc(show).get()).data() as StarterLocale | undefined;
        if (!locale) throw new Error(`No ${show} translation of ${templateId}`);
        console.log(`--- story ---\n${locale.story}\n`);
        for (const bot of template.bots) console.log(`--- ${bot.name}: backstory ---\n${locale.bots[bot.name]?.story}\n\n--- ${bot.name}: introduction ---\n${locale.bots[bot.name]?.intro}\n`);
        const stale = staleStarterLocalePieces(template, locale);
        console.log(stale.length ? `STALE or missing: ${stale.join(', ')}` : 'Complete and current.');
        return;
    }

    const languages = (flag('--language')?.split(',').map(s => s.trim()).filter(Boolean))
        ?? GAME_LANGUAGES.map(l => l.code).filter(code => code !== template.language);
    const unknown = languages.filter(code => !GAME_LANGUAGES.some(l => l.code === code) || code === template.language);
    if (unknown.length) throw new Error(`Not a language this template can be translated into: ${unknown.join(', ')}`);

    const pieces = starterLocalePieces(template);
    const english = Object.fromEntries(Object.entries(pieces).map(([key, text]) => [key, replacePlaceholderName(text, template.humanPlaceholder, STARTER_PLAYER_TOKEN)]));
    let apiKeys: Record<string, string> | undefined;
    let problems = 0;

    const one = async (code: string) => {
        const stored = (await localesRef.doc(code).get()).data() as StarterLocale | undefined;
        const locale: StarterLocale = stored ?? {language: code, story: '', bots: {}, sources: {}, updatedAt: 0};
        const keys = FORCE ? Object.keys(pieces) : staleStarterLocalePieces(template, locale);
        if (keys.length === 0) {
            console.log(`  ${code}: up to date`);
            return;
        }
        const translated = await translate(template, code, keys, apiKeys!);
        for (const key of keys) {
            const problem = problemWith(template, key, english[key], translated[key]);
            if (problem) {
                problems++;
                console.log(`  ${code}: REJECTED ${key}: ${problem}`);
                continue;
            }
            const [name, field] = splitKey(key);
            if (name === undefined) locale.story = translated[key];
            else locale.bots[name] = {...(locale.bots[name] ?? {story: '', intro: ''}), [field]: translated[key]};
            locale.sources[key] = starterTextHash(pieces[key]);
        }
        if (DRY) {
            for (const key of keys) console.log(`    [${code}] ${key}: ${translated[key]}`);
            return;
        }
        // A changed line needs a new take: its old clip would read the old text.
        const clips = {...(locale.clips ?? {})};
        for (const key of keys) {
            const [name, field] = splitKey(key);
            if (name === undefined) delete clips.story;
            else if (field === 'intro') delete clips[name];
        }
        await localesRef.doc(code).set({...locale, clips, updatedAt: Date.now()});
    };

    apiKeys = await getFreeTierApiKeys();
    for (let i = 0; i < languages.length; i += CONCURRENCY) {
        const results = await Promise.allSettled(languages.slice(i, i + CONCURRENCY).map(one));
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                problems++;
                console.log(`  ${languages[i + index]}: FAILED ${result.reason?.message ?? result.reason}`);
            }
        });
    }

    if (!DRY) {
        // The template lists the languages it can be dealt in: complete, current locales only.
        const complete: string[] = [];
        for (const snapshot of (await localesRef.get()).docs) {
            if (staleStarterLocalePieces(template, snapshot.data() as StarterLocale).length === 0) complete.push(snapshot.id);
        }
        const ordered = GAME_LANGUAGES.map(l => l.code).filter(code => complete.includes(code));
        await ref.update({languages: ordered});
        console.log(`\n${templateId} can be played in: ${[template.language, ...ordered].join(', ')}`);
    }
    if (problems) {
        console.log(`${problems} problem(s): run again (only what is missing is translated).`);
        process.exit(1);
    }
    console.log(DRY ? '(dry run, nothing written)' : `Next: record-starter-voices.ts ${templateId} --language all`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
