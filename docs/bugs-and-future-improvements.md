# Bugs and improvements

## Bugs surfaced by the test push (2026-06-10) — pinned in tests, NOT yet fixed

> Each bug below is pinned by a test (marked `PINNED` in the suites listed in
> `test-coverage-gaps.md`). When fixing one, flip its pinned test from
> "documents the bug" to "verifies the fix" as part of the same change —
> the test failing on your fix is expected and is the starting point.

Game-breaking:
- **Detective investigating the abducted player likely crashes**: the compute step
    returns early without setting `detectiveResult` (`detective-processor.ts:50-58`),
    then `processNightAction` dereferences `detectiveResult!.success`
    (`detective-processor.ts:268,275`) → TypeError. The "investigation failed —
    abducted" message is unreachable.
- **Doctor saving the Maniac doesn't undo the abductee's collateral death**: the
    cascade death is added at werewolf-kill time (`werewolf-processor.ts:61-65`) and a
    doctor save only removes the `werewolf_attack` death (`doctor-processor.ts:46-57`).
- **`HumanEliminatedChecker` can never fire**: it looks the human up in `game.bots`,
    but the human is not mirrored there. Day-vote elimination is handled directly in
    `voteImpl`, but night kills of the human may go undetected as game-over. The other
    two win checkers also hardcode the human as alive in counts and role-reveal lists.
- **`welcomeImpl` leaves an unknown bot name stuck at the queue head** — retries error
    forever (`bot-actions.ts:324-327`); no game-state validation in welcome either.

Money/tier:
- **Paid tier skips model validation entirely** (`validateModelUsageForTier` no-ops),
    so `createGame` persists an unresolved `RANDOM` GM model into the game doc.
- **`previewGame` validates some tier/key rules after the LLM call and after charging**
    (`game-actions.ts` ~290, ~385) — invalid selections still cost (and bill) a preview.
- **Spending history understates paid-tier billing**: balance is charged
    cost × (1 + markup) but `updateUserMonthlySpending` records the raw cost.
- **Charging is gated on `game.createdWithTier`, not the user's current tier** —
    compounds the Stripe top-up tier bug: paid users with free-created games are
    never billed for them.
- **Non-atomic charge ordering**: game cost commits before `deductBalance`; either
    side can fail leaving cost-without-charge or charge-without-record.

Robustness:
- **GM bot selection never enforces `BOT_SELECTION_CONFIG.MIN`** — an empty
    `selected_bots` silently sets an empty queue (`bot-actions.ts:618,804`).
- **The human's chat message is lost when GM selection fails** (only saved after
    validation, `bot-actions.ts:801`) — user must retype on error.
- **`setGameErrorState` failure masks the original error** in
    `server-action-wrapper.ts` (the write in the catch block is unguarded).
- Cancellation guard only handles a fully-cleared queue (`bot-actions.ts:935`);
    night compute layer has no aliveness checks on targets; error-log `function`
    name is empty for anonymous wrapped actions.
- **Malformed vote-tally JSON is silently reset** — a corrupt
    `gameStateParamQueue[0]` blob discards all earlier votes without an error,
    both when accumulating and at VOTE_RESULTS (degrades to the no-votes path).
- `humanPlayerVote` returns the game with only the tally in `gameStateParamQueue`
    (drops the individual-votes blob it just wrote to Firestore) — harmless today
    but inconsistent with the persisted state.

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
- Consider clamping GM-selected bot names against the live bot list instead of erroring
  (the `Bot {"Cato":5} not found in game` class — a validated but semantically wrong
  bot-selection response currently puts the game into an error state).

## Migration plan: one tested source of truth for every model picker

**Why.** The free-tier GM dropdown bug (Claude Fable selectable, fixed 2026-06-10) happened
because each model picker builds its list with its own inline logic that no test touches,
while the tested functions (`getAvailableModelsForUser`, `validateModelUsageForTier`) sit
unused by the UI. The GM dropdown on the new-game form is migrated; the rest still have
hand-rolled copies of the same rules.

**Target.** Every picker derives its option list from `app/ai/model-limit-utils.ts` and only
maps the result to its display shape. Tier rules live in exactly one tested place.

**Step 1 — extend the shared module** (`app/ai/model-limit-utils.ts`):
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

**Step 2 — migrate call sites** (each is a small, independent PR-sized change;
`gmModelOptions` on the new-game form is already migrated):
1. `newgame/page.tsx` `playerModelOptions` + `playerModelOptionMeta` (~line 89) — free tier
   shows all models greyed out; keep that UX via `showUnavailableDisabled`.
2. `newgame/page.tsx` `getPreviewModelOptions` (~line 337) — `(N left)` labels from
   `previewUsageCounts`.
3. `newgame/page.tsx` GM reconciliation effect (~line 293) — builds its own `allowed` set;
   should call `getSelectableModelsForUser` instead.
4. `games/[id]/components/ModelSelectionDialog.tsx` `tierFilteredModels` + `modelOptions`
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
