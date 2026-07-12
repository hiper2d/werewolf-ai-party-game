# Bugs and improvements

## Other improvements / wishlist (not from the test push, not test-pinned)

- Popup with the news - need some clever use of local storage
- Resolve vote tie by asking Detective to choose
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities

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
