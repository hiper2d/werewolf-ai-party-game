# Bugs and improvements

- Switch user tier to `paid` automatically when balance is added. Today a Stripe top-up
    only increases `balance`; `tier` stays whatever it was (e.g. `free`), so the user keeps
    playing free-tier games until they manually flip the tier on the profile page. Auto-switch
    on payment success (Stripe webhook / `addBalance`), or at least prompt after top-up.
- Free-tier spend guard for voice. TTS/STT now run on platform keys for free/paid tiers
    (tier-aware key fix, 2026-06-10), but there is no per-dollar spend check anywhere —
    `FREE_TIER_LIMITS` only has count-based limits (games/day, chat resets/game-day).
    Spending is *recorded* (`updateUserMonthlySpending`) but never *checked* for free tier,
    so unbounded speaker-button clicking charges the platform key (~$0.0002 per short
    message; low risk but unbounded). Consider a monthly free-tier dollar cap checked
    where spending is recorded.
- Silent browser-side voice playback failures: in `app/services/tts-service.ts` the
    `HTMLAudioElement` `onError` handler calls `cleanup()` without logging anything, so
    playback failures (autoplay policy, codec) are fully silent. Add a `console.error` +
    surface the same alert path the fetch errors use.
- Fix outdated/broken tests (pre-existing, surfaced 2026-06-10):
    - `app/utils/message-utils.test.ts` — 2 tests expect a `<NewMessagesFromOtherPlayers>`
      message format the code no longer produces; update expectations to the current format.
    - `app/api/night-replay.test.ts` — tsc error `'db' is possibly 'undefined'`.
- `npm run lint` is broken: `next lint` was removed in the current Next version
    ("Invalid project directory provided: .../lint"). Migrate to the ESLint CLI.
- We should hide technical details of bot errors from UI (the collapsible "Technical
    details" disclosure in the error banner). I should be able to get them from logs.
- When a new day starts, right now noghting happens - the user should type something. This is not intuitive. We should ask a GAme paster to pick few bots to reply
- Add buy me coffee/beer/both
- Add Updates page
- Footer on all pages?
- Bots should have better notion of day and night events ordering. Review the summary logic, it should have
    - Unified past days summary text
    - Past days voting results (who voted for whom, in what order; the reasons can be omitted)
    - Past nights results (who died and how, what else happened)
- Add game rules page. Add hints to roles on the game prev
- Resolve vote tie by asking Detective to choose
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities
- Migrate all model pickers onto the tested `getSelectableModelsForUser` helper — see
  the plan in the section below.

## Migration plan: one tested source of truth for every model picker

**Why.** The free-tier GM dropdown bug (Claude Fable selectable, fixed 2026-06-10) happened
because each model picker builds its list with its own inline logic that no test touches,
while the tested functions (`getAvailableModelsForUser`, `validateModelUsageForTier`) sit
unused by the UI. The GM dropdown on the new-game form is migrated; the rest still have
hand-rolled copies of the same rules.

**Target.** Every picker derives its option list from `app/ai/model-limit-utils.ts` and only
maps the result to its display shape. Tier rules live in exactly one tested place.

**Step 1 — extend the shared module** (`app/ai/model-limit-utils.ts`):
- `getSelectableModelsForUser(tier, providedKeyNames)` — done (2026-06-10), used by the GM
  dropdown, covered by `model-limit-utils.test.ts`.
- Add `getModelPickerOptions(tier, providedKeyNames, opts?)` returning display-ready entries
  `{model, disabled, suffix}` so the per-picker decoration logic is also shared and tested:
  - `opts.usageCounts` — per-game usage so free-tier entries get `(N left)` / disabled at 0,
    including the "don't count the currently-selected model against itself"
    adjustment (`Math.max(0, used - 1)`) that `getPreviewModelOptions` and
    `ModelSelectionDialog` each implement today.
  - `opts.currentModel` — always include the current selection even if no longer allowed
    (the "see what you're switching from" escape hatch in `ModelSelectionDialog`).
  - `opts.showUnavailableDisabled` — free tier bot list shows unavailable models greyed out
    with `(not available)` instead of hiding them; GM-style pickers hide them.

**Step 2 — migrate call sites** (each is a small, independent PR-sized change):
1. ~~`newgame/page.tsx` `gmModelOptions`~~ — done.
2. `newgame/page.tsx` `playerModelOptions` + `playerModelOptionMeta` (~line 89) — free tier
   shows all models greyed out; keep that UX via `showUnavailableDisabled`.
3. `newgame/page.tsx` `getPreviewModelOptions` (~line 337) — `(N left)` labels from
   `previewUsageCounts`.
4. `newgame/page.tsx` GM reconciliation effect (~line 293) — builds its own `allowed` set;
   should call `getSelectableModelsForUser` instead.
5. `games/[id]/components/ModelSelectionDialog.tsx` `tierFilteredModels` + `modelOptions`
   (~lines 57–107) — usage counts + current-model escape hatch.

**Step 3 — tests** (extend `model-limit-utils.test.ts`):
- `(N left)` math incl. the current-model self-exclusion; disabled at 0 remaining.
- `currentModel` always present even when disallowed; still marked disabled.
- Free tier with `showUnavailableDisabled`: premium models present but disabled; without it:
  absent. API tier: only uploaded-key vendors in both modes.

**Risks / notes.**
- `RANDOM` is a UI-only pseudo-model (not in `SupportedAiModels`); pickers that offer it
  (bot multi-select) must add it themselves, the helper never returns it.
- Thinking variants are separate model ids with their own free-tier limits — no special
  handling needed, but tests should pin one (`CLAUDE_4_HAIKU` vs `CLAUDE_4_HAIKU_THINKING`).
- Server-side enforcement (`validateModelUsageForTier` at preview/create/update) stays as is —
  it is the backstop; this migration is about the UI never showing what the server rejects.

## Provider structured-response parse failures kill games (recoverable but fatal in practice)

When a provider returns slightly-malformed or truncated JSON, `askWithZodSchema`
throws and the game is left with a persistent `errorState`. The game is marked
`recoverable: true`, but in practice the player has already bailed — the game
sits dead until the 30-day TTL sweeps it.

**Evidence** (from a Firestore scan of the live `games` collection, 2026-06-02):
**5 of 32 live games** were carrying such an error. Every one was a structured-
response parse failure, across multiple providers:

- DeepSeek — `Failed to parse JSON response: SyntaxError: Expected ',' or '}' ... at position 727` (JSON truncated mid-object)
- Grok — `Failed to parse JSON response: Unexpected token 'M', "Max, calli"... is not valid JSON` (model returned prose, not JSON)
- Mistral — `Response validation failed: [...]`
- OpenAI — `Zod field ... uses .optional() without .nullable()` (schema-definition bug, not the model)
- "Bot {\"Cato\":5} not found in game" — downstream of a malformed bot-selection response

**Where it bites:** 4 of the 5 died at `WELCOME` / early `DAY_DISCUSSION` — i.e.
on the **first** LLM call (bot welcome generation). The opening turn is the most
fragile. Concrete case: `star-wars-1780191192418` (GM `gpt-mini`) died at WELCOME
on a DeepSeek bot returning JSON truncated at position 727; player never got past
the intro.

**Suggested fixes:**
- Retry-on-parse-failure: on a Zod/JSON parse error, retry the call 1–2x
  (optionally with a "return ONLY valid JSON matching the schema" nudge) before
  writing `errorState`. Most of these look like one-off bad generations.
- More lenient/repair parse (e.g. extract the first balanced JSON object, strip
  prose preamble) before giving up — handles the "model wrapped JSON in chat" case.
- Fix the OpenAI Zod schema: `.optional()` fields that can be null must also be
  `.nullable()` (provider-side strict-schema requirement).
- The OpenAI/structured-output path should validate the *schema* at build time so
  the `.optional()`-without-`.nullable()` class can't ship.
