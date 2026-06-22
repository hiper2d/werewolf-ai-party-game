# Bugs and improvements

## Other improvements / wishlist (not from the test push, not test-pinned)

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
