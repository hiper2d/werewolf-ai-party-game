# Avatar grid slice verification: high re-roll rate and a 33% hard-failure rate

> Status: **fixed 2026-08-26** — see [What shipped](#what-shipped) at the bottom. Investigated
> 2026-08-24. All paths relative to `werewolf-client/`.
> Evidence: BetterStack S3 log table, 7-day window ending 2026-08-24 21:00 UTC.

## Symptom

BetterStack keeps emitting warnings like:

```
[warn] Avatar grid failed slice verification (attempt 1)  {"gameId":"western-1787601859680","problems":["Hank: rendered text","Clay: rendered text"]}
[warn] Avatar grid failed slice verification (attempt 2)  {"gameId":"western-1787601859680","problems":["Hank: rendered text"]}
```

They are not noise. They are the visible part of a pipeline that is currently throwing away
most of what it generates.

## Numbers (7 days)

| Metric | Count |
|---|---|
| Avatar sets that reached `avatarsStatus: 'ready'` | 6 |
| Avatar generations that hard-failed (`avatarsStatus: 'failed'`) | 3 |
| Grid re-rolls burned on failed slice verification | 18 |
| Logged avatar spend (successes only) | $0.945 |

That is a **33% hard-failure rate**, and roughly **2 extra grid generations per game** on average.

Of the 3 hard failures, 2 are slice verification and 1 is unrelated (see [Unrelated: sharp](#unrelated-sharp-native-module-failure-2026-08-22)).

### Cost per run

`imageOutputPricePerM: 60` (`app/ai/ai-models.ts:112`) and an image bills ~1120 output tokens
regardless of resolution, so **one image call is ~$0.067**. The verifier
(`gemini-3.5-flash-lite`) is text-priced and effectively free.

| Run shape | Images | Cost | Observed |
|---|---|---|---|
| Clean (1 grid + 1 scene pair) | 2 | $0.135 | `erebus-01-1787573576333`, `treasure-island-1787455147447` |
| Verified on attempt 3 | 4 | $0.270 | `evangelion-1787530383150` |
| Hard failure (3 attempts, all rejected) | 4 | ~$0.270 | `cthulhu-mythos-1787575016705` |

**A hard failure is never billed.** `deductBalance` / `updateUserMonthlySpending`
(`app/utils/avatar-generation.ts:395-401`) sit after the `throw` at line 343, so the throw jumps
straight to the catch. The ~$0.27 of Google spend is real, is not charged to the player, and is
not even recorded: the `costUSD` field only exists on the `Avatars generated for game` info log
(line 403), which never fires on the failure path. Actual 7-day avatar spend is therefore
**higher than the $0.945 logged**, by roughly $0.60 that appears nowhere.

## Root cause

**Every single failure is `rendered text`.** Not slicing drift, not gender misalignment. The
image model keeps typesetting characters' names into the portraits despite the explicit no-text
paragraph that closes `buildPrompt` (`avatar-generation.ts:68-92`):

> The character descriptions above are guidance for the drawing only - NEVER render them as
> text. Absolutely no text anywhere in the image: no names, no labels, no captions, no letters,
> no writing of any kind - and no lettering on clothing, equipment, insignia or logos.

Exactly one warning in 18 mentions gender at all, and it also carried a text violation.

The 2026-08-23 mitigation (`firstSentence`, `avatar-generation.ts:40-43`, which stopped feeding
three-sentence bot stories into each cell and caused the Evangelion "character card" layout)
helped but did not close it.

### The actual bug: whole-set rejection for a minority of bad cells

`verifySlices` returns (`avatar-generation.ts:249`):

```ts
return {ok: textViolations === 0 && genderMismatches <= 1, problems};
```

Gender gets a tolerance of one. **Text gets zero tolerance.** One letter in one cell rejects all
13 portraits and forces a full re-roll of the entire grid.

Distribution of the 18 warnings by how many cells were actually flagged:

| Cells flagged | Warnings | Share |
|---|---|---|
| 1 | 4 | 22% |
| 2 | 4 | 22% |
| 3 | 2 | 11% |
| 4 | 2 | 11% |
| 5 | 2 | 11% |
| 13 (all) | 4 | 22% |

**14 of 18 rejections (78%) discarded a majority of good portraits over a minority of bad ones.**

The single most damning case is `cthulhu-mythos-1787575016705` on 2026-08-24:

```
12:37:20  attempt 1 rejected - 13 of 13 cells flagged
12:37:39  attempt 2 rejected - 13 of 13 cells flagged
12:38:00  attempt 3 rejected -  1 of 13 cells flagged  ("Thaddeus: rendered text")
12:38:00  ERROR Avatar generation failed - "Avatar grid failed slice verification twice"
```

Attempt 3 produced 12 clean portraits. All 12 were thrown away because Thaddeus had text on him.
That game fell back to preset sketches.

### Two failure shapes, one handling

The data separates cleanly into two different problems that currently get the same response:

1. **Whole-grid failure (n=13).** The model drew a labeled character-card layout instead of clean
   portraits. Every cell has lettering. A full re-roll is genuinely the right call here. 4 of 18.
2. **Isolated cells (n=1 to 5).** The grid is fine; one or a few characters picked up a name plate,
   a sign, or lettering on a uniform. A full re-roll is the wrong call, is expensive, and does not
   reliably converge. 14 of 18.

### Theme correlation

Failures cluster on themes whose canon designs carry lettering, which supports the hypothesis
already noted in the retry comment at `avatar-generation.ts:317-323`:

- Evangelion (4 runs)
- Cthulhu mythos
- Wild west / western (3 runs) - sheriff badges, wanted posters, saloon signage
- Treasure island

## Full warning log (7 days)

| UTC | gameId | attempt | flagged | problems |
|---|---|---|---|---|
| 08-23 22:03:27 | evangelion-1787520668513 | 1 | 2 | Shinji, Maya |
| 08-23 22:04:56 | evangelion-1787520668513 | 1 | 3 | Shinji, Rei, Maya |
| 08-23 22:34:59 | evangelion-1787524478911 | 1 | 5 | Shinji, Rei, Ritsuko, Fuyutsuki, Kensuke |
| 08-23 22:35:19 | evangelion-1787524478911 | 2 | 3 | Shinji, Ritsuko, Kensuke -> **hard fail** |
| 08-23 22:39:08 | evangelion-1787524478911 | 1 | 4 | Shinji, Rei, Asuka, Ritsuko |
| 08-23 22:39:30 | evangelion-1787524478911 | 2 | 5 | Shinji, Rei, Asuka, Ritsuko, Kensuke |
| 08-24 00:13:26 | evangelion-1787530383150 | 1 | 1 | Maya |
| 08-24 00:13:47 | evangelion-1787530383150 | 2 | 4 | Misato/Ritsuko gender, Maya text + gender |
| 08-24 02:06:32 | treasure-island-1787537171661 | 1 | 13 | all cells |
| 08-24 12:37:20 | cthulhu-mythos-1787575016705 | 1 | 13 | all cells |
| 08-24 12:37:39 | cthulhu-mythos-1787575016705 | 2 | 13 | all cells |
| 08-24 12:38:00 | cthulhu-mythos-1787575016705 | 3 | 1 | Thaddeus -> **hard fail** |
| 08-24 14:24:50 | wild-west-town-1787581470252 | 1 | 1 | Butch |
| 08-24 14:25:14 | wild-west-town-1787581470252 | 2 | 2 | Wyatt, Sheriff |
| 08-24 20:04:40 | western-1787601859680 | 1 | 2 | Hank, Clay |
| 08-24 20:05:01 | western-1787601859680 | 2 | 1 | Hank |
| 08-24 20:41:00 | wild-west-town-1787604041704 | 1 | 2 | Annie, Ranger |
| 08-24 20:41:19 | wild-west-town-1787604041704 | 2 | 13 | all cells |

Note the repeated `attempt 1` entries for one gameId minutes apart (rows 1-2, and 3-4 vs 5-6):
those are separate `runAvatarGeneration` invocations. The claim transaction at
`avatar-generation.ts:276` accepts `avatarsStatus === 'failed'`, so revisiting the game
retries the whole thing from scratch and re-spends.

## Collateral damage on hard failure

1. **Scene images die too, despite succeeding.** `scenePromise` is fired before the retry loop
   (`avatar-generation.ts:305-307`) and is still awaited only after the `throw` at line 343. The
   welcome and night scene images are generated and paid for, then dropped. `getSceneUrl`
   (`app/utils/avatar-utils.ts:26`) returns `undefined` for any game whose `avatarsStatus !== 'ready'`,
   so the game also loses both chat scene images.
2. **Fallback is preset sketches**, via `getPresetAvatarUrl` (`app/utils/avatar-utils.ts:12-13`).
   The comment in the catch block at `avatar-generation.ts:405` says "initial-letter fallback",
   which is stale - it has not been initial letters since presets landed.

## Suggested fixes, in priority order

### 1. Stop rejecting the whole set for a minority of bad cells (the real fix)

Change `verifySlices` to return per-slice verdicts instead of a boolean, then branch on the shape:

- **Most cells flagged** (say `textViolations > slices.length / 2`): whole-grid character-card
  failure. Re-roll the grid as today.
- **A few cells flagged**: keep the good slices and repair only the bad ones. Two options, cheapest
  first:
  - Accept the set and fall back to `getPresetAvatarUrl` for just the offending characters. Zero
    extra API calls, game keeps 11 or 12 themed portraits plus both scene images.
  - Regenerate only the offending cells as a small secondary grid (a 2x1 or 2x2 costs the same
    ~$0.067 as a full 4x4, so this is only worth it over the preset fallback if the visual
    consistency matters).

This alone converts every one of the 14 minority-flag rejections into a non-event, and turns the
`cthulhu-mythos` hard failure into a shipped set with one preset portrait.

### 2. Bill or at least record the failure path

Move the cost accounting so `gridCostUSD` is captured even when the run throws, or log `costUSD`
in the catch at `avatar-generation.ts:407`. Right now failed runs are invisible to cost tracking,
which is why this went unnoticed while burning roughly $0.60 in a week on a low-traffic day count.

### 3. Harden the prompt against lettering-heavy themes

The no-text paragraph is already last and already explicit. Worth trying, cheapest first:
- Move the no-text rule to the **front** of the prompt as well as the end, or repeat it per cell line.
- Strip proper nouns that read as sign-able from the per-cell prompt (roles like "Sheriff" invite a badge).
- The setting text (`game.theme` + `game.description`, injected verbatim at
  `avatar-generation.ts:80`) is unfiltered player input and can itself contain text-suggestive
  nouns. Consider a note in the prompt that setting text is scene guidance only.

### 4. Cosmetic

`avatar-generation.ts:343` throws `'Avatar grid failed slice verification twice'`. The loop has run
three attempts since 2026-08-23. Message should say three, or just drop the count.

## Unrelated: sharp native module failure (2026-08-22)

One of the 3 hard failures in the window is a different bug, and appears resolved (all prod runs
on 08-24 sliced fine):

```
2026-08-22 08:32:20  wild-west-town-1787387539474
Failed to load external module sharp-3865b2dbd6af8bb8:
  Could not load the "sharp" module using the linux-x64 runtime
  ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
```

`sharp` is dynamically imported at `avatar-generation.ts:311`, after `scenePromise` is already in
flight, so this failure mode wastes one scene image (~$0.067) per occurrence. If it recurs, the
fix is the platform-specific optional dependency (`npm install --os=linux --cpu=x64 sharp`).

## How to re-run this investigation

Credentials and the query recipe are in `.claude/skills/debugging/SKILL.md`. The one-liner:

```bash
cd werewolf-client
BS_HOST=$(grep '^BETTERSTACK_CH_HOST=' .env | cut -d= -f2-)
BS_USER=$(grep '^BETTERSTACK_CH_USER=' .env | cut -d= -f2-)
BS_PASS=$(grep '^BETTERSTACK_CH_PASS=' .env | cut -d= -f2-)

curl -s -u "$BS_USER:$BS_PASS" "$BS_HOST" -H "Content-type: plain/text" -d "
SELECT dt,
       JSONExtractString(raw,'gameId') AS g,
       substring(JSONExtractString(raw,'message'),1,60) AS msg,
       length(JSONExtractArrayRaw(raw,'problems')) AS n_flagged,
       arrayStringConcat(arrayMap(x -> JSONExtractString(x), JSONExtractArrayRaw(raw,'problems')), ' | ') AS problems
FROM s3Cluster(primary, t507167_ai_werewolf_2_s3)
WHERE dt > now() - INTERVAL 7 DAY
  AND positionCaseInsensitive(raw,'failed slice verification (attempt') > 0
ORDER BY dt ASC FORMAT PrettyCompact"
```

Swap the `positionCaseInsensitive` needle for `'Avatars generated for game'` (successes, carries
`costUSD` and `cells`) or `'Avatar generation failed'` (hard failures, carries `error`).


## What shipped (2026-08-26)

Fix 1 and fix 2 below, plus the player-facing half that falls out of them for free: the crops a
round used to discard are now *kept* as portrait candidates, which is exactly what a "let me pick
a different face" control needs.

- **`verifySlices` returns per-slice verdicts** (`SliceVerdict[]`) instead of one whole-set
  boolean. Deciding what to keep moved to the caller.
- **`isSystemicFailure`** distinguishes the two failure shapes the data separates into: a majority
  of cells carrying text (the labeled character-card layout) or more than one gender mismatch (a
  drifted grid) means redraw; a few flagged cells ship as-is. Every one of the 14 minority-flag
  rejections is now a non-event, and text-prone themes stop burning ~2 extra grids per game.
- **No hard failure from verification.** Every round's crops are stored in
  `games/{id}/avatarVariants/{key}__{n}`; `chooseSelected` copies the first unflagged one into
  `games/{id}/avatars/{key}`, so every existing reader (image route, illustration reference
  portraits, chat, cinematic) is unchanged. A flagged portrait still beats a preset sketch.
- **Scene images survive.** They were generated, paid for, and dropped whenever verification
  hard-failed; that path no longer exists.
- **Abandoned spend is recorded.** `recordAbandonedSpend` puts the images a dying run already paid
  Google for into `totalGameCost` / `totalImagesCost` and bills them, instead of the ~$0.60/week
  that appeared nowhere.
- **Owner-facing reroll.** Arrows in the corner of the character card walk a character's
  candidates (each click commits the shown one as their portrait everywhere); the circular arrow
  redraws the whole cast — one image call costs the same for one cell as for sixteen, so a reroll
  always redraws everyone and each character just gains an alternate. Free games get one reroll
  (`FREE_TIER_AVATAR_REGENS`), paid games are unlimited and billed like every other image.
  A reroll deliberately does **not** flip `avatarsStatus` to `'generating'` — that would drop the
  whole cast back to preset sketches for its ~20s — it sets `avatarsRegeneratingAt` instead.

Fix 3 (prompt hardening for lettering-heavy themes) is still open, and is now much less urgent:
a stray badge costs one flagged cell, not the whole set.
