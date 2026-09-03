# Plan: Split preview generation + per-character visual descriptions

Status: implemented 2026-09-02 (pipeline in `app/ai/preview-generation.ts`; the live story
suite in `app/ai/all-models.test.ts` runs the same function).

Context (before): the single `previewGame` LLM call was slow and failure-prone (huge
structured JSON), and characters had no dedicated visual direction for image generation
(portraits reused the first sentence of the story).

## Problem

1. `previewGame` (`werewolf-client/app/api/game-actions.ts`) makes ONE
   `askWithZodSchema(GameSetupZodSchema)` call: a ~218-line system prompt
   (`app/ai/prompts/story-gen-prompts.ts` — game rules, character sourcing rules, full
   voice catalog, playstyle mappings) returning scene + GM voice + 12 players ×
   (name, gender, 3-5 sentence story, playStyle, voice, voiceStyle) as one JSON object.
   `configureStoryAgent` raises `maxOutputTokens` just for it. Long structured outputs
   fail late: one malformed field at player 11 wastes minutes of generation.
2. Portrait cells are built as `(gender) "name" — firstSentence(story)`
   (`app/utils/avatar-generation.ts:60-64`). Stories are written for role ambiguity,
   not appearance — bad visual direction.

Note / expectation-setting: a `visualDescription` like "the actual Sam Altman look"
still will NOT produce real-person likenesses — Gemini deliberately steers named real
people to generic faces (provider policy, not fixable app-side). The field's value is
precise, stable visual control (hair, clothing, age, vibe) and consistency across
redraws and mid-game illustrations.

## Design

### Stage 1 — "casting" (one small call)

Output: scene (2-3 sentences) + GM voice + GM voiceStyle + cast list of
`{name, gender}` pairs. This call keeps: character-sourcing rules (canonical names for
known universes, ASCII-only names, ExcludedName), scene-generation task, werewolf-count
mention. Small output → fast and reliable even on thinking models.

### Stage 2 — "character sheets" (parallel batches of ~4 players)

For each batch (Promise.all): input = theme + optional description + scene from stage 1
+ the FULL cast name list (coherence) + the batch's `{name, gender}` slice.
Output per player: story (3-5 sentences), playStyle, voice (picked from the
gender-filtered voice subset), voiceStyle, **visualDescription** (1-2 sentences,
appearance only).

- Batch size ~4 (constant, tune later): variety instructions ("don't give everyone the
  same playstyle") need multiple characters per context; 4-player JSON is still small.
- Trim the per-batch system prompt: playstyle list + voice subset for the batch's
  genders + story rules only. No scene task, no sourcing rulebook. Cache-friendly.

### Voice uniqueness (lost by parallelism)

After all batches land, dedupe voice collisions server-side: reassign collisions from
the unused pool of the same gender (`getRandomVoiceForGender` / voice-config pools).
Personality matching survives for non-colliding picks.

### Failure model

Per the project rule (no backend LLM retries — errors surface in UI, user retries):
a failed batch fails the `previewGame` action; the user's retry is now cheap and
failures should be rare since no call carries a huge JSON.

### Cost tracking

Sum token usage across stage 1 + all stage-2 batches into the existing preview
accounting (same place the single call's `tokenUsage` is recorded today, incl. paid-tier
`deductBalance` flow in `previewGame`).

## Implementation checklist

1. **Schemas** (`app/ai/prompts/zod-schemas.ts`):
   - `GameCastingZodSchema`: scene, gameMasterVoice, gameMasterVoiceStyle,
     `cast: [{name, gender}]`
   - `CharacterSheetBatchZodSchema`: `players: [{name, story, playStyle, voice,
     voiceStyle, visualDescription}]`
   - Keep `GameSetupZodSchema` only if anything else imports it; otherwise remove.
   - New optional fields must be `.nullable().optional()` (zod-schemas.test.ts guard),
     but visualDescription should be REQUIRED in the new schema.
2. **Prompts** (`app/ai/prompts/story-gen-prompts.ts`): split `STORY_SYSTEM_PROMPT` /
   `STORY_USER_PROMPT` into casting + character-sheet variants per the design above.
   visualDescription instructions: appearance only (face, hair, build, clothing, one
   distinguishing detail), no role hints, no text/logos.
3. **Pipeline** — extracted as a pure function `generateGamePreview(createAgent, input)`
   in `app/ai/preview-generation.ts` (stage 1 call → balanced batches → `Promise.all`
   stage-2 calls → assemble by name → `assignUniqueVoices` → summed usage + per-stage
   breakdown). `previewGame` (`app/api/game-actions.ts`) passes an agent-factory closure
   (GM agent + userId + `configureStoryAgent`) and does model distribution / billing on
   the summed usage. The live story test calls the SAME function so it cannot drift
   from production. `configureStoryAgent` stays applied to both stages (harmless ceiling).
4. **Types**: `visualDescription?: string` on `BotPreview` and `Bot`
   (`app/api/game-models.ts`); flow through `createGame` bot construction; add to
   `AvatarDraftSpec` + the draft-spec construction on the newgame page /
   `avatar-draft-actions.ts`.
5. **Image consumers** (fallback to `firstSentence(story)` everywhere for legacy games):
   - Portrait cells: `app/utils/avatar-generation.ts` `buildPortraitCells`
   - Preview drafts: wherever `AvatarDraftSpec.bots` feeds the same cell builder
   - Mid-game illustration brief cast list: `app/utils/illustration-generation.ts`
     (`writeIllustrationBrief` uses `b.story.slice(0, 160)` today)
6. **Preview UI** (`app/games/newgame/page.tsx`): editable "Visual description" field
   per character card in the preview form (next to story / voice style), included in
   what `createGame` receives.
7. **Tests**: `preview-generation.test.ts` covers batch splitting, assembly, voice
   dedupe, usage summing and the failure model; `game-actions.*.test.ts` stubs answer
   casting vs. batch schemas. Live: `all-models.test.ts` story suite runs the pipeline at
   15 bots per model — it now measures wall time / cost and whether the parallel batch
   burst trips a provider rate limit (the failure mode that replaced truncation).
   Run `npx jest --watchman=false` (watchman broken in sandbox) + `npx tsc --noEmit`.

## Open knobs / follow-ups

- Rate limits: if a provider 429s on the 4-call burst in the live suite, add a
  concurrency cap in the pipeline (not retries).

- Batch size: start at 4.
- Whether stage 1 should also pick playStyles (variety is easier with the whole cast in
  one context) — current plan leaves playStyle in stage 2 with a per-batch variety
  instruction; revisit if batches come back homogeneous.
