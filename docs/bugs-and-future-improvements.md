# Bugs and improvements

## Other improvements / wishlist (not from the test push, not test-pinned)

- **[TOP PRIORITY] Auto-correction round on a night-action validation failure.** Small models fail
  the STRICT target-name constraint by naming a dead/invalid player (observed 2026-07-26:
  mistral-medium-3 as maniac Jace returned `target: "Rook"` - a corpse - twice, while its own
  reasoning correctly said "Rook is dead, target Selkie"). The `BotResponseError` already carries
  `{selectedTarget, availableTargets, recoverable:true}`; instead of surfacing Retry on first
  failure, append that rejection to the model's history ("You chose Rook. Rook is dead. Choose
  EXACTLY from: ...") and re-ask ONCE before giving up. Applies to maniac/doctor/detective/werewolf
  processors. Bare-retry replays identical context and fails identically - this is the real fix.
  (The companion fix — a one-shot "Retry with different model" — shipped 2026-07-26, see Done below.)
- Resolve vote tie by asking Detective to choose
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities

## ✅ Done: error-banner "Change model" is now a one-shot "Retry with different model" (2026-07-26)

The error banner's model button no longer permanently switches the failing bot's model (which was
unusable for hidden roles: you had to guess who holds the role, and a mid-game model change in the
players list leaked it). It now stores a one-shot `modelOverride` on the game doc
(`retryWithModelOverride` in `game-actions.ts`) and clears `errorState` in the same write; the
auto-processing effects re-run the failed action, which consumes the override
(`consumeModelOverride` — deleted from Firestore BEFORE the AI call, kept in memory) so it applies
to exactly one request. `getEffectiveModel` (`app/utils/bot-utils.ts`, tested) resolves the model at
every bot/GM agent-creation site (4 night processors, welcome/talk/vote, summaries, GM night
narration, GM bot selection). The server resolves WHO to retry from the persisted error context +
queue heads (`resolveRetryTarget`), so the client never needs to know which bot holds a hidden role;
the banner also hides the failing model name during NIGHT (a unique model would identify the role
holder). Permanent model changes are still available from the players list. Tier/usage rules are
enforced via the same `validateModelUsageForTier` as a permanent change.

## ✅ Done: one tested source of truth for every model picker (2026-06-24)

Every model picker now derives its option list from `getModelPickerOptions(tier,
providedKeyNames, opts?)` in `app/ai/model-limit-utils.ts` and only maps the result to its
display shape. Tier/usage rules live in exactly one tested place — the hand-rolled, untested
copies that caused the free-tier GM dropdown bug (Claude Fable selectable, fixed 2026-06-10)
are gone.

- **Helper** returns display-ready `{model, disabled, suffix}` entries and supports:
  `opts.usageCounts` (`(N left)` labels + disable-at-0, with the
  "don't count the current model against itself" `Math.max(0, used - 1)` adjustment),
  `opts.currentModel` (always-include escape hatch, disabled when disallowed), and
  `opts.showUnavailableDisabled` (free tier shows unavailable models greyed `(not available)`
  vs. GM-style pickers hiding them). Never returns `RANDOM`.
- **Migrated call sites:** `newgame/page.tsx` `gmModelOptions`, `playerModelOptions` +
  `playerModelOptionMeta`, `getPreviewModelOptions`, and the GM reconciliation effect (now
  calls `getSelectableModelsForUser`); `games/[id]/components/ModelSelectionDialog.tsx`
  `modelOptions` (the separate `tierFilteredModels` step was folded in).
- **Tests:** `model-limit-utils.test.ts` covers `(N left)` math incl. current-model
  self-exclusion, disabled-at-0, the always-present-but-disabled escape hatch,
  `showUnavailableDisabled` on/off, and API/PAID tier gating. Thinking variants are pinned
  (`CLAUDE_4_HAIKU` 3 bots vs `CLAUDE_4_HAIKU_THINKING` 1 bot).
- Server-side enforcement (`validateModelUsageForTier`) is unchanged — it remains the
  backstop; this work only stops the UI from offering what the server would reject.
