import {execFileSync} from "child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "fs";
import {tmpdir} from "os";
import {join} from "path";
import {createVoiceAgent, VOICE_PROVIDER_API_KEY} from "@hiper2d/ai-agents";
import {db} from "../firebase/server";
import {namesStarterPlayer, staleStarterLocalePieces, STARTER_GAMES_COLLECTION, STARTER_LOCALES_COLLECTION, STARTER_STORY_CLIP, starterAudioDocId, StarterClip, StarterLocale, StarterTemplate} from "../app/utils/starter-games";
import {LEGACY_VOICE_PROVIDER} from "../app/ai/voice-config";

/**
 * Records the voice clips of a starter template (docs/plan-growth-roadmap.md, track 1): the
 * opening story in the Game Master's voice and each character's introduction in its own.
 * A game made from the template plays these instead of calling the voice model, so its
 * first minute has voices at no cost and with no wait.
 *
 * A line that names the human placeholder is NOT recorded: the name differs per player, so
 * that line is read live in each game. Keep the opening story and the introductions free of
 * the human's name when building a template.
 *
 * The voice model returns WAV (about 48 KB a second), far over Firestore's 1 MiB document
 * limit for anything longer than a few seconds, so each clip is encoded to mono MP3 with
 * ffmpeg (must be installed) before it is stored in starterGames/{id}/audio/{clipKey}.
 *
 * Usage (from werewolf-client/, sandbox off):
 *   npx tsx --env-file=.env scripts/record-starter-voices.ts <templateId> [--only <clipKey>] [--dry-run]
 *       [--language ru,ja | --language all]   record a translation's clips (translate-starter-game.ts first)
 * Re-running records every clip again (a new take); --only records one ("story" or a name).
 * Without --language the template's own language is recorded. A translation is read by the
 * same voices: the voice model speaks the language of the text it is given.
 */

const MAX_CLIP_BASE64 = 900_000; // stays under the 1 MiB document limit with room for the fields

function toMp3(wav: ArrayBuffer): Buffer {
    const dir = mkdtempSync(join(tmpdir(), 'starter-voice-'));
    try {
        const input = join(dir, 'in.wav');
        const output = join(dir, 'out.mp3');
        writeFileSync(input, Buffer.from(wav));
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input, '-ac', '1', '-b:a', '48k', output]);
        return readFileSync(output);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const templateId = process.argv[2];
    if (!templateId || templateId.startsWith('--')) {
        console.error('Usage: record-starter-voices.ts <templateId> [--only <clipKey>] [--dry-run]');
        process.exit(1);
    }
    const onlyIndex = process.argv.indexOf('--only');
    const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
    const dryRun = process.argv.includes('--dry-run');

    const ref = db.collection(STARTER_GAMES_COLLECTION).doc(templateId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error(`No starter template "${templateId}"`);
    const template = {...(doc.data() as Omit<StarterTemplate, 'id'>), id: doc.id};

    const voiceProvider = template.voiceProvider ?? LEGACY_VOICE_PROVIDER;
    const keys = (await db.collection('config').doc('freeTierApiKeys').get()).data() ?? {};
    const keyName = VOICE_PROVIDER_API_KEY[voiceProvider];
    const apiKey = keys.keys?.[keyName] ?? keys[`keys.${keyName}`] ?? keys[keyName];
    if (!apiKey) throw new Error(`No ${keyName} in config/freeTierApiKeys`);
    const agent = createVoiceAgent(voiceProvider, apiKey);

    const languageArg = process.argv.indexOf('--language') >= 0 ? process.argv[process.argv.indexOf('--language') + 1] : undefined;
    const languages: (string | undefined)[] = !languageArg ? [undefined]
        : languageArg === 'all' ? (template.languages ?? [])
        : languageArg.split(',').map(code => code.trim()).filter(Boolean);

    let totalCost = 0;
    for (const lang of languages) {
        // What is read: the template's own text, or a translation's.
        let story = template.story;
        let texts: Record<string, string> = Object.fromEntries(template.bots.map(bot => [bot.name, bot.intro]));
        let existing = template.clips;
        const localeRef = lang ? ref.collection(STARTER_LOCALES_COLLECTION).doc(lang) : undefined;
        if (localeRef) {
            const locale = (await localeRef.get()).data() as StarterLocale | undefined;
            if (!locale || staleStarterLocalePieces(template, locale).length > 0) {
                console.log(`${lang}: no complete, current translation (run translate-starter-game.ts ${templateId} --language ${lang}); skipped`);
                continue;
            }
            story = locale.story;
            texts = Object.fromEntries(template.bots.map(bot => [bot.name, locale.bots[bot.name].intro]));
            existing = locale.clips;
        }
        const lines = [
            {key: STARTER_STORY_CLIP, who: 'Game Master', text: story, voice: template.gameMasterVoice, voiceStyle: template.gameMasterVoiceStyle},
            ...template.bots.map(bot => ({key: bot.name, who: bot.name, text: texts[bot.name], voice: bot.voice, voiceStyle: bot.voiceStyle})),
        ].filter(line => !only || line.key === only);
        if (lines.length === 0) throw new Error(`No clip "${only}" in this template`);

        const clips: Record<string, StarterClip> = {...(existing ?? {})};
        const version = Date.now();
        const audioDoc = (key: string) => ref.collection('audio').doc(starterAudioDocId(key, lang));
        console.log(`Recording ${templateId}${lang ? ` in ${lang}` : ''} with the ${voiceProvider} voices${dryRun ? ' (dry run)' : ''}`);
        // A few lines at a time: a template in thirteen languages is over a hundred clips.
        const record = async (line: typeof lines[number]) => {
            const label = `  ${lang ?? ''} ${line.who.padEnd(14)}`;
            if (namesStarterPlayer(line.text, template.humanPlaceholder)) {
                console.log(`${label} SKIPPED: names the human, so it is read live in every game`);
                delete clips[line.key];
                if (!dryRun) await audioDoc(line.key).delete();
                return;
            }
            if (dryRun) {
                console.log(`${label} ${line.text.length} chars, voice ${line.voice}`);
                return;
            }
            const {audio, costUSD, styleDropped} = await agent.speak({text: line.text, voice: line.voice, voiceStyle: line.voiceStyle});
            totalCost += costUSD;
            const mp3 = toMp3(audio);
            const data = mp3.toString('base64');
            if (data.length > MAX_CLIP_BASE64) {
                console.log(`${label} SKIPPED: ${Math.round(mp3.length / 1024)} KB as MP3 is too long for one document; it is read live`);
                delete clips[line.key];
                await audioDoc(line.key).delete();
                return;
            }
            await audioDoc(line.key).set({data, mime: 'audio/mpeg', voice: line.voice, chars: line.text.length, createdAt: version, ...(lang ? {lang} : {})});
            clips[line.key] = {voice: line.voice, version, ...(lang ? {lang} : {})};
            console.log(`${label} ${Math.round(mp3.length / 1024)} KB, $${costUSD.toFixed(4)}${styleDropped ? ' (voice style was refused: read plain)' : ''}`);
        };
        for (let i = 0; i < lines.length; i += 3) {
            const results = await Promise.allSettled(lines.slice(i, i + 3).map(record));
            results.forEach((result, index) => {
                if (result.status === 'rejected') console.log(`  ${lang ?? ''} ${lines[i + index].who}: FAILED ${result.reason?.message ?? result.reason} (run again with --only ${lines[i + index].key})`);
            });
        }
        if (!dryRun) {
            await (localeRef ?? ref).update({clips});
            console.log(`  ${Object.keys(clips).length} clip(s)${lang ? ` for ${lang}` : ' on the template'}.`);
        }
    }
    if (!dryRun) console.log(`Done. Cost $${totalCost.toFixed(3)}.`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message ?? error); process.exit(1); });
