# Plan: Avatar maps with adjustable frames

> Status: **implemented 2026-09-03** from the Claude Design handoff ("Create Game - Improved"). The plan below is the morning draft; see "What shipped" at the end for where the build differs. All paths are relative to `werewolf-client/`.

## Context

Every portrait draw returns one grid image (the **map**) that the app slices into per-character cards. The map is thrown away after slicing, and the slicer cuts at fixed equal intervals. Two findings from the 2026-09-02 investigation (Sherlock preview + a fresh raw draw):

- The model draws the divider lines wherever it likes. On a correctly drawn 4x4 sheet the row heights were 497 / 485 / 428 / 382 px on a 2400x1792 canvas while the slicer assumed 448 each, so lower rows were cut through the previous character's chest. Columns were exact.
- Sometimes the model draws fewer rows than asked (the Sherlock preview got 3 rows for a 4x4 request), which shifts every slice below the first row and drops the last characters entirely.
- On top of that, `PlayerAvatar` re-crops the stored card again (`center 15% / 140%`) and `CharacterPoster` shows the central 3:4.35 strip of it, so what the player sees is never the stored card as-is.

The feature: keep the map, record where each card was cut, and let the owner move the frame on the map for any variant of any character, including the mannequin placeholders, which get a map of their own. Regenerating adds a new map and a new adjustable variant per character.

## Model

A **variant** of a character = a **map** + a **frame** on it.

| Variant kind | Map | Where the frame lives | What is served |
|---|---|---|---|
| Generated, round *i* | `avatars/sheet-{i}` doc (private, per game or draft) | candidate doc `avatarVariants/{key}__{i}` → `sheet`, `frame` | the stored cut in the same candidate doc, re-cut on every adjustment |
| Mannequin | `public/presets/sheet.webp` (static asset) | `avatarVariants[key].mannequin` on the game / draft doc | rendered client-side from the static sheet with the frame (no stored bytes) |

Why generated cuts are stored bytes but mannequins are CSS-cropped: generated maps are private, 500 KB, and consumed by many readers (chat rows, poster, cinematic mode, illustration references need real pixels server-side). Storing one small cut per variant keeps all of those readers unchanged. The mannequin sheet is a public static asset the browser caches once, its white ground must keep the multiply blend over the per-name gradient, and nothing server-side ever needs mannequin pixels.

Candidate index *i* equals draw round *i*: every draw appends exactly one candidate per key (`writeCandidates`), so the map of candidate *i* is `sheet-{i}`. Candidate docs still carry `sheet` explicitly so a legacy candidate 0 (adopted from a pre-variants game) is recognisable as "no map, not adjustable".

Sheets live in the existing `avatars` subcollection under dashed keys, like scenes and mid-game illustrations already do. Dashed keys cannot collide with player names, the existing image routes serve them with no new routes, `copyDraftIntoGame` / `deleteDraftImages` sweep them for free, and draft TTL `expireAt` rides along via `docExtras`.

## Design decisions to settle with the UI rework

1. **Frame shape.** Today one 512x512 square feeds three shapes: the chat circle (zoomed 140%, anchored 15% from top), the poster (central 3:4.35 strip), and the preview thumbnails (circles). Recommendation: the adjustable frame is the **card**, i.e. poster-shaped (3:4.35), stored at 512x742; the circle shows the top square of that card. The editor previews both. Then the stored card is exactly what the player framed, and `PlayerAvatar` / `CharacterPoster` stop re-cropping.
2. **Candidates kept.** `MAX_AVATAR_CANDIDATES` is 3 today; the design shows two. Each kept round also keeps its ~500 KB map. Set the cap to whatever the design shows.
3. **Minimum frame size.** Cells are ~500 px tall on a 2K sheet; a card cut from a 250 px frame is upscaled 3x and soft. Suggest a floor of ~40% of the cell height.
4. **Free tier.** Adjusting is free (no model call). Nothing to gate.

## Data model changes

`app/api/game-models.ts`

- `AvatarFrame = {left: number; top: number; width: number; height: number}` in map pixels.
- `avatarVariants[key]` gains `mannequin?: AvatarFrame` (frame on the static sheet; absent = the assigned preset's cell).
- `avatarSheetKey(index) = 'sheet-' + index`; `isAvatarSheetKey`.
- Candidate doc shape gains `sheet: number` and `frame: AvatarFrame`.
- Sheet doc shape: `{data, mime, width, height, cells: {left, top, width, height}[] /* detected, row-major */, createdAt, expireAt?}`.

`app/utils/preset-avatars.ts`

- `PRESET_SHEET = {url: '/presets/sheet.webp', width, height, cells: Record<presetFile, AvatarFrame>}`, generated together with the asset by a new `scripts/build-preset-sheet.ts` (composes the 17 existing webp files into a 6x3 grid; the per-file frames come out of that script).
- `getPresetFrame(bots, name): AvatarFrame` = the cell of `getPresetAvatarUrl`'s file.

## Server work

### 1. Slicer: detect the grid, keep the map (`app/utils/avatar-generation.ts`)

- `detectGridCells(sharp, buffer, expected: {cols, rows})`: greyscale raw scan; a row/column is a divider when >85% of its pixels are near-black; collapse runs; cells are the spans between dividers (ignore the border runs). If the detected counts match the request, use them. If columns match but rows don't (the 3-row case), use the detected cells anyway, map them to keys in row-major order, and log `AVATAR_GRID_MISMATCH` with both counts; keys past the last cell get no candidate this round (they keep what they had) instead of a stranger's face. If detection finds nothing usable, fall back to the equal split with a warning.
- Auto frame per cell: card-shaped (decision 1), as tall as the cell minus the divider inset, centered horizontally, top-anchored. Recorded on the candidate.
- `sliceGrid` returns `{key, jpeg, frame}` per cell plus the encoded sheet: full resolution, JPEG q85 (`mozjpeg`), ~400 KB / ~530 KB base64 (measured); if base64 exceeds 900 KB, step quality down to 75, then width to 2048.
- `drawIllustrationSet` returns `{portraits, scenes, sheet: {jpeg, width, height, cells}}`.
- `writeCandidates` takes the sheet, writes `avatars/sheet-{round}` alongside the candidates (same chunked batch, same `docExtras`), stores `sheet` + `frame` on each candidate doc, and deletes `sheet-{j}` for every round that aged out of the window (`j < min(first)` across keys).
- Remove the 8 px fixed inset from frames; the detected cell bounds already exclude the divider.

### 2. Re-cut on adjustment

- `recutCandidate(parentRef, key, index, frame)` in `avatar-generation.ts`: loads `avatars/sheet-{index}`, validates the frame (inside the sheet, card aspect within tolerance, above the minimum), `sharp.extract(frame).resize(512, 742)`, rewrites the candidate doc (bytes + frame), and if `sel === index` also `avatars/{key}`; bumps `avatarVersions[key]`. Pure Firestore + sharp, no billing.
- `setMannequinFrame(parentRef, key, frame)`: validates against `PRESET_SHEET`, writes `avatarVariants[key].mannequin` (FieldPath, the GM key has a dash) and bumps `avatarVersions[key]` so the client re-renders.
- Server actions: `adjustAvatarFrame(gameId, key, index | 'mannequin', frame)` in `avatar-actions.ts` (owner check) and `adjustDraftAvatarFrame(key, index | 'mannequin', frame)` in `avatar-draft-actions.ts` (draft addressed by session email). Both return `{key, index, version}`.
- Drafts: `draft.version` is NOT bumped by adjustments (it is the adoption handshake); only `avatarVersions[key]` moves. `avatarVariants` including `mannequin` frames copy into the game verbatim through `copyDraftIntoGame`.

### 3. Map delivery

- Existing routes already serve `avatars/sheet-{i}` by key: `/api/games/{id}/avatars/sheet-3?v=` and `/api/avatar-drafts/sheet-3?v=`. Cache immutable as today; version = the round's `createdAt`.
- The sheet doc's `cells` are returned to the client through game / draft state? No: the editor only needs the current frame and the sheet size; keep `cells` server-side (used for the auto frame and logging). Sheet size is sent with the candidate's frame in `avatarVariants` state — add `sheets: Record<number, {width, height}>` to the game / draft doc, written by `writeCandidates`.

## Client work (component contracts, visuals from the design handoff)

- `FrameEditor` (new, pure): props `{mapUrl, mapSize, frame, aspect, minSize, onChange, onCommit}`. Renders the map scaled to fit, a draggable frame locked to `aspect`, resize by wheel / pinch / corner handle, keyboard nudge, and a live card + circle preview cropped with CSS from the same map. No server traffic until commit.
- `CharacterCard` / the preview card: an "Adjust" affordance per variant (hidden when the variant has no map: legacy candidate 0, or games without sheets). The switcher's position list gains nothing: the mannequin and each round are already the positions.
- `PlayerAvatar`, `CharacterPoster`, `CinematicMode`: when a mannequin frame exists, render the static sheet with `background-position/size` computed from the frame instead of the single preset file (blend unchanged). For generated cards, drop the 140% zoom and the poster's strip crop once cards are poster-shaped (decision 1); until then keep them.
- `getAvatarUrl` keeps its string contract for the default cases; a new `getAvatarSource(game, name): {url, frame?, blend}` is what the three renderers switch to.
- Preview page (`app/games/newgame/page.tsx` + `IllustrationsPanel`): the same editor over the draft routes and `adjustDraftAvatarFrame`; adjustments do not mark the draft stale.

## Retention, legacy, cost

- Per game: at most `MAX_AVATAR_CANDIDATES` maps at ~500 KB each. Adjustments overwrite, they never add docs.
- Games and drafts drawn before this ship have no sheet docs and no `frame` fields: the switcher works as today and the adjust affordance is hidden. No backfill.
- An adjustment is one sheet read, one sharp crop, one or two small writes. No model call, so nothing to bill.
- `TTL`: sheet docs in drafts carry `expireAt` like every other draft image doc; the console TTL policy on `expireAt` for the `avatars` collection group already covers them.

## Tests

- `detectGridCells`: synthetic sheets (equal grid, drifting rows, 3 rows for a 4-row request, no dividers) → expected cells / fallback / mismatch.
- `writeCandidates`: sheet doc written per round, `sheet` + `frame` on candidates, aged-out sheets deleted with their candidates.
- `recutCandidate` / `setMannequinFrame`: frame validation (outside sheet, wrong aspect, too small), selected-copy refresh, version bump.
- `getAvatarSource`: mannequin default cell vs. custom frame, generated with / without frame.
- Live: `scripts/` one-off that draws a sheet and prints the detected cells (the raw 2026-09-02 sheet is the fixture: dividers at y 497 / 982 / 1410 and x 600 / 1200 / 1800).

## Rollout order

1. Slicer + sheet storage + detection (ships better first cuts immediately, invisible otherwise).
2. Server re-cut and mannequin frame actions + tests.
3. Preset sheet asset + `PRESET_SHEET` + renderer support for mannequin frames.
4. `FrameEditor` + card / preview integration per the design handoff.

## What shipped (2026-09-03)

Decisions the design settled:

1. **Frame shape**: the adjustable frame is the **card**, portrait 3:4, stored at 600x800 (`CARD_WIDTH_PX` / `CARD_HEIGHT_PX`); the round avatar is a **circle inside the card** (`AvatarCircle`: x, d as fractions of the card's width, y of its height; default `{0.14, 0.03, 0.72}`), applied client-side. The card cut is what every reader serves; the circle never becomes stored bytes.
2. **Candidates kept**: still `MAX_AVATAR_CANDIDATES = 3`, one sheet per kept round.
3. **Minimum card**: `MIN_CARD_HEIGHT_FRACTION = 0.12` of the sheet height.
4. **Adjusting is free** on every tier: no model call, no billing.

Where the code differs from the draft above:

- Types: `ImageRect`, `AvatarCircle`, `AvatarFraming {card, circle}`, `AvatarVariantEntry {n, sel, first?, framing?, drawn?, mannequin?}` (`game-models.ts`). `framing[index]` is the current framing, `drawn[index]` what the slicer chose ("Reset to the drawn crop"), `mannequin` the custom framing on the preset sheet. No `sheets` size map — the editor reads the sheet's natural size from the loaded image.
- Geometry lives in `app/utils/avatar-framing.ts` (pure, browser-safe): `cardInCell`, `fitCard`/`fitCircle`/`fitFraming`, `circleFocus`, `cardFocus`, `circleFocusOnSheet`, `focusToBackground`. An `ImageFocus` (fractions of an image) is the renderer contract: `PlayerAvatar` takes `focus`, `CharacterPoster` takes `cardFocus`, cinematic thumbs use it too. `getAvatarView(game, name)` in `avatar-utils.ts` produces `{url, focus, cardFocus, blend}` for the three cases (custom mannequin off the preset sheet, drawn card with framing, legacy plain URL). `getReframeSource` feeds the editor.
- Divider detection: `app/utils/sheet-detection.ts` (`detectSheetGrid` over a greyscale plane, `findDividers`, `equalSplitGrid`). Sheets are normalised to ≤2400 px wide first so cells, cards and the stored sheet share one pixel space. Mismatch (fewer rows drawn) → equal split for everyone + `AVATAR_GRID_MISMATCH` warn; the invariant "every key gets one candidate per draw" is kept on purpose, because candidate index == sheet round is what makes `avatars/sheet-{i}` addressable, and a bad auto-cut is now recoverable by reframing. Verified against the 2026-09-02 raw sheet: dividers at y 493/978/1406, x 597/1196/1796, 15 ms.
- Sheet doc: `avatars/sheet-{round}` = `{data, mime, width, height, cells, detected, createdAt, expireAt?}`, JPEG q85 mozjpeg (~411 KB for the sample), q72 fallback past 900 KB base64. Candidate docs gain `{sheet, card, circle}`. `writeCandidates(..., sheet)` writes it, keeps `mannequin`, drops `sheet-{j}` for `j < min(first)` across keys.
- Reframe: `applyReframe(parentRef, variants, key, target, framing, docExtras)` shared by `reframeGameAvatar` (owner check) and `reframeDraftAvatarFor` (draft by email, status ready). Server actions `reframeAvatar(gameId, key, target, framing)` / `reframeDraftAvatar(key, target, framing)` → `ReframeResult {key, target, version, framing}`; `target` is a candidate index or `'mannequin'`. Draft `version` untouched.
- Mannequin sheet: `public/presets/sheet.webp` (3072x1536, 6 columns of 512 px cells: male 1–8, female 1–8, GM) built by `scripts/build-preset-sheet.mjs`; `PRESET_SHEET_URL`, `PRESET_SHEET_SIZE`, `presetSheetCell`, `getPresetFraming` in `preset-avatars.ts`.
- UI: `ReframeModal` (`app/components/`), the redesigned new-game page and `IllustrationsPanel` per the handoff; the in-game `CharacterCard` gets a reframe entry for the viewed candidate or the mannequin.
- Tests: `sheet-detection.test.ts`, `avatar-framing.test.ts`, `avatar-sheets.test.ts` (sheet write, framing bookkeeping, retention).

### Detection hardening and the 5x3 grid (evening of 2026-09-03)

Three more real sheets showed the model's grid habits: 6x3 for a 4x4 request (Dracula draft 1), an irregular sheet with two clean rows of 4 and a third row of 6 line-less cells (Dracula draft 2), and — once asked for 5x3 — two compliant 5x3 sheets, one of them with dark name plates under every portrait despite the no-text rule.

- `detectSheetGrid` now trusts whatever grid the lines form (the request is only the equal-split fallback); row lines are found over the full width, column lines **per row band** (a band with no lines borrows the layout above); lines must be 3 px to 8 % of the sheet thick (specks out, name plates in — a plate then sits outside its cell, which is what we want), and a line that would leave a span under 12 % of the sheet is ignored.
- `gridFor`: 13–15 cells → **5x3** (480x597 cells on the 4:3 canvas). Every deviation the model made was towards square-to-portrait cells; both 5x3 test draws complied. 4x4 (landscape cells) stays only for >15, which a 12-player table never reaches.
- Re-detection on all five stored sheets: 5x3 ✓, 5x3 ✓, 4x4 ✓, 6x3 ✓, and the irregular sheet as 4+4+2 (its third row has no lines to find; reframe by hand).
- `scripts/recut-sheet.ts` re-cuts a stored round with the current slicer (game or draft) — used to repair the first Dracula draft without a redraw.
- Preview pipeline: model failures are now logged with the stage (`casting the lobby` / `writing character sheets, batch i of n`), the model and the truncation flag, and the page appends the stage to its message.
