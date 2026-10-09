# Plan: what to do with a game after a content refusal

Status: design draft, nothing implemented. Discussed with Alex on 2026-09-29. Written
2026-10-04, on top of the content-limits work (`app/ai/prompts/content-limits.ts`). Since
2026-10-09 the content screen would-blocks on hard flags only (minors / real_harm / hate) and
asks Jev and OpenAI Decisions at once (`app/api/jev-screen.ts`). "Decisions" is what Alex agreed in the
conversation, "Design" is how the code would carry it, "Open questions" is still Alex's call.

## Problem

When a provider refuses a turn (Gemini `PROHIBITED_CONTENT` / `SAFETY`, Qwen
`DataInspectionFailed`, Claude `stop_reason: refusal`), today's banner
(`app/games/[id]/components/GameChat.tsx`, refusal branch) does two things:

1. puts the provider on the game's block list (`recordProviderBlock`), so the same account
   is not hit twice: correct, and the reason the block list exists;
2. offers **Retry with different model** and **Reassign all <provider> players**.

Step 2 sends the same refused story to the next provider. If the refusal was right, that
spreads the risk across our platform accounts instead of containing it. It only helps when
the refusal was a false positive. We have no way to tell those two cases apart today,
and no way to know WHICH part of the prompt caused it. Providers don't say.

## Decisions (Alex, 2026-09-29)

1. **Don't pass a refused story to another provider as is.** Retrying elsewhere is allowed
   only once the prompt has been checked and found clean, or cleaned.
2. **Keep the per-game provider block list** as the backstop. It is a safety device, not a
   feature; its UX is not worth more work.
3. **The classifier is the first line of defense.** The screen stays in `monitor` mode for now;
   switching to `enforce` is a separate decision (see `scripts/jev-screen-report.ts`).
4. **Use Jev to triage the refusal**: find the likely cause, then pick the remedy from what
   it finds.

## What a refused prompt contains

A bot turn is built by `getBotMessages` (`app/api/game-actions.ts`) + the bot system prompt.
Three parts, no more:

| Part | What | Written by |
|---|---|---|
| **Setup** | theme, Game Master instructions, scene, the bot's bio (system prompt) | player + story generation |
| **Diaries** | one summary per earlier day (`bot.daySummaries`) — earlier days are NOT sent verbatim | the bot itself |
| **Today** | the current day's messages, verbatim | player, bots, Game Master |

Game Master prompts (night narration, vote results) carry the setup and today's messages
too. So the culprit is always in the setup, a diary, or today. It is never deep in a long
history, and every part is small enough to screen.

Since the content-limits work, the likely culprits change:

- **New games:** story generation keeps setups PG-13 (`STORY_CONTENT_LIMITS`), bots deflect
  explicit pushes (`BOT_CONTENT_LIMITS`), and the Game Master narration stays PG-13. The likely culprit is the
  **player's own chat lines**. The screen would-blocks on hard flags only, so explicit chat
  is `grey`, never blocked, and is saved and enters every bot's "today".
- **Games created before the content limits** (the bikini-contest kind): the **setup** itself,
  and bot replies/diaries written when bots still played along.

## Design

### 1. On refusal (server, in the action wrapper — unchanged first step)

`server-action-wrapper.ts` already detects the refusal (`refusalOf`) and records the provider
block. Keep that. Add: run the triage (step 2) and store its result on the error state
(`game.errorState.triage`), so the banner can render it without another round trip.

The triage never re-sends anything to a model provider. It is one batch of Jev calls,
and the player still triggers every retry. This stays within the no-backend-retries rule.

### 2. Triage: screen the parts of the refused prompt

Assemble the parts for the actor whose turn was refused (the bot, or the Game Master), then:

- **Human chat lines** — already screened when sent; reuse the stored `jevScreenCalls` row
  (look up by `gameId` + message text/timestamp; a stored message id on the screen record
  would make this exact — see Implementation). No new call.
- **Bot messages of today, the actor's diaries, the setup** — never screened. Screen each now,
  in parallel, with a new `JevScreenSource` (`'triage'`) and the preview context wording
  (the text "will be sent to an AI provider as part of the prompt").
- **Flag rule** for triage: the **preview rule** for every part (top-two probability ≥ 0.6, or a hard
  flag ≥ 0.9). Chat's "score never blocks" exception exists so a player isn't stopped for
  one crude line; here we are looking for what a provider already refused, so the strict
  rule is the right one.

Cost: a day has ~20–60 messages; at ~$0.00003 per call the whole triage is well under a cent
and ~0.5 s with the calls in parallel. Every call is recorded in `jevScreenCalls` like today
(source `triage`, the refusal's game/day/model attached).

### 3. Outcome → remedy

| Triage finds | Reading | Banner offers |
|---|---|---|
| **Setup flagged** | The game itself is the problem; every prompt carries it. | **End the game.** No retry, no edit: nothing in the chat can fix the frame. Short, honest explanation. |
| **Messages or a diary flagged** (setup clean) | Specific content, not necessarily the latest line. | **Hide the flagged items and continue.** Highlight them in the chat; one button "Remove these N messages and retry with another model". |
| **Nothing flagged** | Probably a jumpy provider filter (Gemini `SAFETY` is known for it). | Today's options: **Retry with different model** / **Reassign all**. |
| **Triage failed** (Jev down / timeout) | Unknown. | See open question 1. |

### 4. Hiding messages (not rewinding)

- **Why not rewind** to before the earliest flagged message: it would undo votes, deaths and
  night actions that happened since. That is messy state surgery, and it destroys the
  player's game.
- **Hide** = a flag on the message (`hiddenForContent: true` + the triage id), not a delete.
  `convertToAIMessages` replaces a hidden message with a neutral placeholder
  (`[message removed]`) in EVERY bot's prompt and the Game Master's; the chat shows it collapsed to the player.
  The original stays in Firestore for the record (and expires with the game).
- **A flagged diary** is regenerated from the day's cleaned messages, the same call the day
  summary already uses. It is a normal paid AI call, triggered by the player's button.
- After hiding, **re-screen the cleaned prompt** (the same triage, now cheap: only the parts that
  changed). Only a clean result unlocks "retry with another model".

### 5. Two strikes per game

If a cleaned game is refused again by a **second** provider, end the game. Two refusals in one
game means something Jev doesn't catch, and continuing would just walk the story across our
accounts one provider at a time. (The provider block list already stops a repeat on the first one.)

### 6. Ending a game for content

A terminal state the player can still read: `gameState = GAME_OVER` with
`endedReason: 'content'` (new field), no winner, and a GM-free closing line written in code, not
by a model. The game stays in /games for reading; "create a new game" is the call to action.

### Edge cases

- **Refusal at night**: the banner must not name other actors on the provider (roles leak);
  the existing `actorsOnProvider` rule already hides them. Triage highlights apply only to
  public messages; a flagged private night message is hidden without being shown.
- **Refusal in the preview** (no game yet): no triage, nothing to clean. Show a readable
  message instead of the raw library text: "The Game Master's AI provider refused this setup
  because of its content policy. Change the theme or instructions, or pick a Game Master
  from another provider." The same change should give the empty-cast case its own message.
- **Game Master turn refused**: same triage over the GM's prompt; there are no diaries, but the setup and today
  are there.
- **Legacy games without stored chat screens** (before 2026-09-19): screen the human lines in the
  triage too.

## Open questions (Alex)

1. **Triage fails** (Jev error/timeout, it does happen: one in 334 calls over 10 days): fall back to
   today's banner (risk: forwarding a bad story), or show only "End the game" / "try again later"?
   Leaning: today's banner, since a Jev outage is rare and the block list still holds.
2. **Show the player which messages were flagged?** Highlighting their own lines is honest and
   teaches the line; it also tells a prober exactly what tripped the filter. Alternative: hide
   silently and say "some messages were removed".
3. **Free vs paid**: same treatment for both tiers? Paid games are where Fable/Opus lineups lose
   the most on an Anthropic block.
4. **Repeat offenders** (5 users made all 27 would-blocks in 10 days): out of scope here, but a
   "N refusals/would-blocks a day → free tier paused" rule would act on the source.

## Implementation steps

1. Store the chat message id on the screen record (`jevScreenCalls.messageId`), so a triage can
   reuse a human line's verdict exactly.
2. `JevScreenSource` += `'triage'`; `screenParts(parts[])` in `jev-screen.ts` (parallel, preview rule,
   records each call). Pure `decideTriage(parts, verdicts)` → `{ outcome, flagged[] }`, unit-tested.
3. `refusalPromptParts(game, actor)`: setup, diaries, today, built from the same sources as
   `getBotMessages` / GM prompts, so triage screens what the provider saw.
4. Wrapper: on refusal, after `recordProviderBlock`, run the triage and write `errorState.triage`.
5. Message flag + placeholder in `convertToAIMessages`; collapsed rendering in the chat.
6. Actions: `hideFlaggedAndRetry(gameId, triageId, model)`, `endGameForContent(gameId)`.
7. Banner: three variants from the table above; drop Reassign/Retry from the flagged variants.
8. Preview: readable refusal and empty-cast messages in `previewGameAction`.
9. Tests: triage outcomes, placeholder in prompts, the two-strike rule, the night no-leak rule.
