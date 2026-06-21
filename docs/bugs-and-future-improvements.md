# Bugs and improvements

## Recently fixed (2026-06-21)

- **Detective investigating an abducted player no longer crashes** — `detective-processor.ts`
    now records a failed result (`success: false`) on the abducted path instead of leaving
    `detectiveResult` null for downstream code to dereference.
- **Doctor saving the Maniac now undoes the abductee's collateral death** — the `protect`
    branch in `doctor-processor.ts` removes the linked `maniac_collateral` death when it
    removes the Maniac's `werewolf_attack` death.
- **Paid-tier spending history records the marked-up amount actually charged** (not the raw
    model cost) in both `cost-tracking.ts` and the `previewGame` charge path.
- **Token-usage charging now charges the user before committing the game cost**
    (`cost-tracking.ts`) — an insufficient balance aborts before anything is persisted, so
    there is no more cost-recorded-but-never-charged window. (Not yet fully atomic — see below.)
- **GM bot selection clamps invalid/duplicate/human names instead of erroring**, and enforces
    `BOT_SELECTION_CONFIG.MIN` by topping up with random alive bots, so it never sets an empty
    responder queue (`bot-selection.ts`). `handleHumanPlayerMessage` now delegates to the same
    `selectRespondingBots` helper instead of a duplicated inline copy.
- **The human's chat message is persisted before GM selection runs** — it survives a selection
    failure, so the user never has to retype.
- **A new day auto-opens with a few bots** — `selectDayRespondersImpl` calls
    `selectRandomDayOpeningBots`, so the day no longer sits idle waiting for the human to type.
- **`welcomeImpl` no longer loops forever on an unknown bot name** — it advances the queue
    past the bad entry before surfacing the error, and is now a no-op outside the `WELCOME` state.
- **Malformed vote-tally JSON now surfaces an error state** instead of silently resetting to an
    empty tally — `parseVoteTally` / `parseIndividualVotes` throw on a corrupt blob, and the
    VOTE_RESULTS path validates the tally before transitioning state (`bot-actions.ts`).
- **`humanPlayerVote` echoes back both blobs** (tally + individual votes) exactly as persisted,
    matching Firestore.
- **A night kill of the human now ends the game** — added a persistent `humanPlayerIsAlive`
    field on the Game model (set on day-vote and night-kill, defaulting legacy games to alive).
    All three win-checkers in `game-end-checker.ts` consult it instead of looking the human up
    in `game.bots` (where they never appear).
- **Paid-tier model selections are now validated** — `validateModelUsageForTier` rejects the
    `RANDOM` placeholder and unknown model ids on the paid tier too (it previously no-opped),
    so an unresolved `RANDOM` can never be persisted into a game.
- **`previewGame` validates all model/key selections up front** — before the LLM call and any
    charge — so an invalid selection no longer costs a (billed) preview.
- **Token-usage charging keys off the user's current tier**, not `game.createdWithTier`
    (`cost-tracking.ts`), so a user who upgrades to paid is billed even for games started on the
    free tier. (Still depends on the tier actually being flipped — see the Stripe auto-switch
    wishlist item.)
- **Charging the user and committing the game cost is now fully atomic** — the balance
    deduction, the monthly-spending record and the game-cost update all happen in a SINGLE
    Firestore transaction (`cost-tracking.ts` `commitUsageAtomically`). An insufficient paid
    balance throws before any write, and the user doc can no longer end up with a deducted
    balance but no matching spending entry. The monthly-spending merge logic moved to a shared,
    tested pure helper (`spending-utils.ts` `applySpending` / `formatPeriod`), reused by
    `updateUserMonthlySpending`. (Closes the last Money/tier item from the test push.)
- **`setGameErrorState` failure no longer masks the original error** — the persist call in
    `server-action-wrapper.ts` is wrapped; a write failure logs and returns a fallback game
    carrying the real error (reusing the game already loaded for attribution) instead of
    throwing the write error over the original.
- **Wrapped server actions always log a function name** — `withErrorHandling` falls back to
    `anonymousAction` when `fn.name` is empty, so anonymous arrow actions no longer produce
    blank `function` fields in error logs/context.
- **Night resolution never records a duplicate death** — the detective (which runs last) and,
    defensively, the werewolf skip adding a second death for a player already in
    `state.deaths`, so a detective kill on a player the werewolves already killed can't
    double-count or report two deaths.
- **The day-discussion cancellation guard now requires the queue head to still be the bot
    being processed** (`bot-actions.ts`), not merely a non-empty queue — so a cancel that is
    immediately followed by a new round repopulating the queue can no longer be clobbered by a
    stale queue write.
- Verified already implemented (removed from the wishlist): buy-me-a-coffee, news/updates
    page (`/news`), standalone rules page (`/rules`).

## Other improvements / wishlist (not from the test push, not test-pinned)

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
- We should hide technical details of bot errors from UI. The collapsible "Technical details"
    disclosure is gone, but the error banner still renders `error.details` inline (truncated to
    ~150 chars in `GameChat.tsx`). Consider dropping it entirely and reading details from logs.
- Footer on all pages? (`DocFooter` is on the doc pages — privacy/terms/about — and the home
    page has its own; in-game pages still have none.)
- Bots should have better notion of day and night events ordering. Review the summary logic, it should have
    - Unified past days summary text
    - Past days voting results (who voted for whom, in what order; the reasons can be omitted)
    - Past nights results (who died and how, what else happened)
- Add hints to roles on the game preview (the standalone rules page now exists at `/rules`).
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
