/**
 * Two-stage story generation for the new-game preview.
 *
 * Stage 1 ("casting") is one small call: the scene, the Game Master's voice, and the cast
 * list as {name, gender} pairs. Stage 2 ("character sheets") writes the biographies in
 * parallel batches of a few characters each: story, playstyle, voice, voice style, and a
 * visual description for portrait generation. Every call carries a small JSON object, so
 * truncation and late schema failures — the reason the previous single-call version was
 * slow and flaky — no longer apply. A failed batch fails the whole preview: the app never
 * retries LLM calls on the backend, and the user's retry is now cheap.
 *
 * This is the whole production pipeline as a pure function of an agent factory; the live
 * story test (app/ai/all-models.test.ts) runs the same function so it cannot drift from
 * previewGame.
 */
import {AbstractAgent, AIMessage, TokenUsage} from '@hiper2d/ai-agents';
import {getRandomVoiceForGender, PLAY_STYLES} from '@/app/api/game-models';
import {VoiceConfig, VoiceMetadata} from '@/app/ai/voice-config';
import {format} from '@/app/ai/prompts/utils';
import {
    CASTING_SYSTEM_PROMPT,
    CASTING_USER_PROMPT,
    CHARACTER_SHEET_SYSTEM_PROMPT,
    CHARACTER_SHEET_USER_PROMPT,
} from '@/app/ai/prompts/story-gen-prompts';
import {CharacterSheetBatchZodSchema, GameCastingZodSchema} from '@/app/ai/prompts/zod-schemas';

/** Characters per stage-2 call. Small enough that the JSON stays trivial for any model,
 * large enough that the "vary the playstyles" instruction has something to vary across. */
export const CHARACTER_SHEET_BATCH_SIZE = 4;

export interface PreviewGenerationInput {
    theme: string;
    description: string;
    /** The human player's name — never reused for a character. */
    excludedName: string;
    botCount: number;
    werewolfCount: number;
    /** Pre-formatted role list for the casting prompt. */
    gameRolesText: string;
    /** Pre-formatted playstyle list for the character-sheet prompt. */
    playStylesText: string;
    voiceConfig: VoiceConfig;
}

export interface GeneratedCharacter {
    name: string;
    gender: 'male' | 'female';
    story: string;
    playStyle: string;
    voice: string;
    voiceStyle?: string;
    visualDescription: string;
}

export interface PreviewStageUsage {
    label: string;
    tokenUsage?: TokenUsage;
}

export interface GeneratedPreview {
    scene: string;
    gameMasterVoice: string;
    gameMasterVoiceStyle?: string;
    players: GeneratedCharacter[];
    /** Usage summed over every call in the pipeline (what the preview bills). */
    tokenUsage?: TokenUsage;
    /** Per-call breakdown, in call order (casting first). */
    stages: PreviewStageUsage[];
}

/** Builds a fresh agent for one system prompt — casting and character sheets use different
 * ones. previewGame wires in the user id and the story output profile here. */
export type PreviewAgentFactory = (systemPrompt: string) => AbstractAgent;

/** Where the pipeline is, for a progress indicator. Emitted as a whole state each time it
 * advances: once at the start of casting, once when the cast is known, once per batch that
 * lands. Batches finish in any order, so `writtenNames` grows non-contiguously. */
export interface PreviewProgress {
    stage: 'casting' | 'sheets';
    cast: {name: string; gender: 'male' | 'female'}[];
    batchesTotal: number;
    batchesDone: number;
    writtenNames: string[];
}

export type PreviewProgressListener = (progress: PreviewProgress) => void;

interface CastEntry {
    name: string;
    gender: 'male' | 'female';
}

export async function generateGamePreview(
    createAgent: PreviewAgentFactory,
    input: PreviewGenerationInput,
    onProgress?: PreviewProgressListener,
): Promise<GeneratedPreview> {
    const stages: PreviewStageUsage[] = [];
    const progress: PreviewProgress = {stage: 'casting', cast: [], batchesTotal: 0, batchesDone: 0, writtenNames: []};
    const report = () => onProgress?.({...progress, cast: [...progress.cast], writtenNames: [...progress.writtenNames]});
    report();

    // ---- Stage 1: casting -------------------------------------------------------------
    const castingPrompt = format(CASTING_USER_PROMPT, {
        theme: input.theme,
        description: input.description,
        number_of_players: input.botCount,
        excluded_name: input.excludedName,
        game_roles: input.gameRolesText,
        werewolf_count: input.werewolfCount,
        available_voices: input.voiceConfig.getPromptDescription(),
    });
    const castingAgent = createAgent(CASTING_SYSTEM_PROMPT);
    const [casting, , castingUsage] = await castingAgent.askWithZodSchema(GameCastingZodSchema, [userMessage(castingPrompt)]);
    if (!casting) {
        throw new Error('Failed to get AI response');
    }
    stages.push({label: 'casting', tokenUsage: castingUsage});

    const cast = normalizeCast(casting.cast, input.botCount);

    // ---- Stage 2: character sheets, in parallel batches --------------------------------
    const fullCastText = cast.map(c => `${c.name} (${c.gender})`).join(', ');
    const sheetAgent = createAgent(CHARACTER_SHEET_SYSTEM_PROMPT);
    const batches = splitIntoBatches(cast, CHARACTER_SHEET_BATCH_SIZE);
    progress.stage = 'sheets';
    progress.cast = cast;
    progress.batchesTotal = batches.length;
    report();
    const batchResults = await Promise.all(batches.map(async (batch, i) => {
        const genders = new Set(batch.map(c => c.gender));
        const voices = (['male', 'female'] as const)
            .filter(g => genders.has(g))
            .flatMap(g => input.voiceConfig.getVoicesByGender(g));
        const prompt = format(CHARACTER_SHEET_USER_PROMPT, {
            theme: input.theme,
            description: input.description,
            scene: casting.scene,
            full_cast: fullCastText,
            batch: batch.map(c => `    - ${c.name} (${c.gender})`).join('\n'),
            play_styles: input.playStylesText,
            available_voices: describeVoices(voices),
        });
        const [sheets, , usage] = await sheetAgent.askWithZodSchema(CharacterSheetBatchZodSchema, [userMessage(prompt)]);
        if (!sheets) {
            throw new Error(`Failed to get AI response for character batch ${i + 1}`);
        }
        progress.batchesDone += 1;
        progress.writtenNames.push(...batch.map(c => c.name));
        report();
        return {batch, sheets: sheets.players, usage};
    }));
    batchResults.forEach((r, i) => stages.push({label: `character sheets ${i + 1}/${batchResults.length}`, tokenUsage: r.usage}));

    // ---- Assemble: every cast member must have exactly its own sheet -------------------
    const validPlayStyles: string[] = Object.values(PLAY_STYLES);
    const players: GeneratedCharacter[] = [];
    for (const {batch, sheets} of batchResults) {
        for (const member of batch) {
            const sheet = sheets.find(s => nameKey(s.name) === nameKey(member.name));
            if (!sheet) {
                throw new Error(`The AI did not return a character sheet for ${member.name}. Please try again.`);
            }
            const playStyle = validPlayStyles.includes(sheet.playStyle)
                ? sheet.playStyle
                : validPlayStyles[Math.floor(Math.random() * validPlayStyles.length)];
            players.push({
                name: member.name,
                gender: member.gender,
                story: sheet.story,
                playStyle,
                voice: sheet.voice,
                voiceStyle: sheet.voiceStyle || undefined,
                visualDescription: sheet.visualDescription.trim(),
            });
        }
    }
    assignUniqueVoices(players, input.voiceConfig);

    return {
        scene: casting.scene,
        gameMasterVoice: pickGameMasterVoice(casting.gameMasterVoice, input.voiceConfig),
        gameMasterVoiceStyle: casting.gameMasterVoiceStyle || undefined,
        players,
        tokenUsage: sumTokenUsage(stages.map(s => s.tokenUsage)),
        stages,
    };
}

function userMessage(content: string): AIMessage {
    return {role: 'user', content};
}

/** Name identity for matching a sheet back to its cast entry: models occasionally
 * re-case or re-space a name they were told to copy verbatim. */
function nameKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeCast(raw: {name: string; gender: string}[], expected: number): CastEntry[] {
    const cast: CastEntry[] = raw
        .map(c => ({
            name: String(c.name ?? '').trim(),
            gender: /^f/i.test(String(c.gender ?? '')) ? 'female' as const : 'male' as const,
        }))
        .filter(c => c.name.length > 0);
    if (cast.length !== expected) {
        throw new Error(`The AI cast ${cast.length} characters instead of ${expected}. Please try again.`);
    }
    const keys = new Set(cast.map(c => nameKey(c.name)));
    if (keys.size !== cast.length) {
        throw new Error('The AI produced duplicate character names. Please try again.');
    }
    return cast;
}

/** Splits the cast into the fewest batches of at most `size`, sized evenly so the last
 * batch is never a lonely one-character call (5 → 3+2, not 4+1). */
export function splitIntoBatches<T>(items: T[], size: number): T[][] {
    if (items.length === 0) return [];
    const count = Math.ceil(items.length / size);
    const per = Math.ceil(items.length / count);
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += per) {
        batches.push(items.slice(i, i + per));
    }
    return batches;
}

/** The voice catalog formatted for one batch — only the genders present in it. */
function describeVoices(voices: VoiceMetadata[]): string {
    return voices.map(v => {
        let line = `- ${v.id} (${v.gender}): ${v.description ?? ''}`;
        if (v.celebrityExamples?.length) line += ` Similar to: ${v.celebrityExamples.join(', ')}.`;
        if (v.biography) line += ` Background: ${v.biography}`;
        return line;
    }).join('\n');
}

/**
 * Keeps each character's AI-picked voice when it is a real voice of the right gender that
 * no earlier character already took; otherwise reassigns from the unused voices of that
 * gender. Batches run in parallel and cannot see each other's picks, so collisions are
 * expected — this is where uniqueness is restored. Once a gender's pool is exhausted
 * (more characters than voices) reuse is unavoidable and a random voice of the gender is
 * used.
 */
export function assignUniqueVoices(players: {gender: 'male' | 'female'; voice: string}[], voiceConfig: VoiceConfig): void {
    const used = new Set<string>();
    for (const player of players) {
        const meta = player.voice ? voiceConfig.getVoiceById(player.voice) : undefined;
        const genderOk = !meta?.gender || meta.gender === player.gender;
        if (meta && genderOk && !used.has(meta.id)) {
            used.add(meta.id);
            continue;
        }
        const pool = voiceConfig.getVoicesByGender(player.gender);
        const unused = pool.filter(v => !used.has(v.id));
        const candidates = unused.length > 0 ? unused : pool;
        player.voice = candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)].id
            : getRandomVoiceForGender(player.gender); // Ultimate fallback
        used.add(player.voice);
    }
}

function pickGameMasterVoice(aiPick: string | undefined, voiceConfig: VoiceConfig): string {
    if (aiPick && voiceConfig.getVoiceById(aiPick)) {
        return aiPick;
    }
    // Fallback to a random male voice for the Game Master (the GM portrait is drawn male to match)
    const maleVoices = voiceConfig.getVoicesByGender('male');
    return maleVoices.length > 0
        ? maleVoices[Math.floor(Math.random() * maleVoices.length)].id
        : getRandomVoiceForGender('male');
}

/** Sums usage across calls; undefined when no call reported usage. `durationMs` adds up
 * as total compute time, not wall time — batches overlap. */
export function sumTokenUsage(usages: (TokenUsage | undefined)[]): TokenUsage | undefined {
    const present = usages.filter((u): u is TokenUsage => !!u);
    if (present.length === 0) return undefined;
    const total: TokenUsage = {inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0};
    for (const u of present) {
        total.inputTokens += u.inputTokens ?? 0;
        total.outputTokens += u.outputTokens ?? 0;
        total.totalTokens += u.totalTokens ?? 0;
        total.costUSD += u.costUSD ?? 0;
        if (u.reasoningTokens !== undefined) total.reasoningTokens = (total.reasoningTokens ?? 0) + u.reasoningTokens;
        if (u.cachedInputTokens !== undefined) total.cachedInputTokens = (total.cachedInputTokens ?? 0) + u.cachedInputTokens;
        if (u.durationMs !== undefined) total.durationMs = (total.durationMs ?? 0) + u.durationMs;
    }
    total.costUSD = parseFloat(total.costUSD.toFixed(8));
    return total;
}
