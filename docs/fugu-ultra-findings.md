# Sakana Fugu Ultra in a 12-bot Werewolf game: measurements and why we're removing it

Source notes for a media write-up. All numbers measured 2026-08-04/05 against the live Sakana
API, using this game's real prompts (a day-2 vote with full game context — the same ~13.7k-token
prompt every model in our roster answered). Cost breakdown comes from the `FUGU_COST_CALIBRATION`
raw-usage logging in `fugu-agent.ts` (retrievable from BetterStack). Caveat everywhere below:
these are single-digit sample counts, not a benchmark — but the effects are 5-10x, not 5-10%.

## What Fugu is

Sakana AI's Fugu line are **orchestrating models**: one API call triggers an internal multi-step
workflow on Sakana's servers — the model plans, drafts, critiques, and re-synthesizes across
several internal passes before emitting the single response you see. The API is
OpenAI-compatible on the surface, but the usage object carries extra fields
(`orchestration_input_tokens`, `orchestration_output_tokens`, and cached variants) that itemize
the hidden work. Every one of those tokens bills at the normal input/output rates.

The mental model: every other provider sells you a completion; Fugu sells you a managed
mini-agent-pipeline per request, and the orchestration fields are its itemized subcontractor
bill.

Two Fugu models existed in the game:

- **base `fugu`** — a dynamic router with no published price. Retired from the game 2026-08-04
  after reconciling BetterStack token logs against the Sakana balance: it bills at fugu-ultra's
  rates ($5/M in, $30/M out), which made our $1/$3 placeholder a **5.7x undercharge** ($4.80 real
  vs $0.85 tracked over three days). Its cache hit rate was 9.3% — effectively zero, since every
  hit came from duplicate calls seconds apart.
- **`fugu-ultra`** — the flagship, with published pricing. The subject of the rest of this doc.

## Speed: in a different league, and not in the good way

One identical day-2 vote per model, run sequentially in one session (2026-08-04):

| Rank | Model | Time |
|---|---|---|
| fastest | Mistral 4 Small | 1.3s |
| median of the roster | most models | 3-12s |
| second slowest | GLM-5.2 (Thinking) | 25.4s |
| slowest | **Sakana Fugu Ultra** | **>180s (hit the 3-minute test timeout)** |

Repeat runs of the same call: **174.4s** (passed with 5.6s to spare), **>180s** (timed out), and
once **16.2s**. So it's 7-11x slower than the second-slowest model on a typical run — and
occasionally fast, which is almost worse: the variance is the model's own internal loop deciding
how many passes the problem deserves. Same prompt, same day, 10x latency spread. There is no
knob that makes it predictable.

For a turn-based party game where 12 bots take turns talking, a 3-minutes-per-reply bot means
the human stares at a "thinking" indicator for the length of a pop song, per turn, per Fugu bot.
It is tagged `extremely slow` in the model picker as of 2026-08-04; removal is planned (see
bugs-and-future-improvements.md).

## Price: $0.59 for a four-sentence vote, and 65% of it is invisible

The itemized usage for one successful vote call (Kenji, day-2 context):

| Usage field | Tokens | Billed at | Cost |
|---|---|---|---|
| `prompt_tokens` (the conversation we sent) | 13,674 | $5/M input | $0.068 |
| `orchestration_input_tokens` (internal passes re-reading context/drafts) | 25,160 | $5/M input | $0.126 |
| `completion_tokens` (visible response, incl. 4,347 reasoning) | 4,531 | $30/M output | $0.136 |
| `orchestration_output_tokens` (internal drafts/critiques we never see) | 8,504 | $30/M output | $0.255 |
| **Total real** | | | **≈ $0.585** |

Two ways to read that table:

- **~65% of the bill ($0.38) is work you never see** — 25k tokens of internal re-reading (about
  two extra full passes over the context) plus 8.5k tokens of internal writing, to produce a
  four-sentence vote in the end.
- **Standard OpenAI-compatible cost tracking undercounts it ~2.9x.** A tracker that reads only
  `prompt_tokens`/`completion_tokens` (i.e., nearly everyone's) records $0.204 for this call.
  The orchestration fields are nonstandard, so unless you parse them explicitly, the money is
  simply missing from your books. We found this the hard way, by reconciling against the Sakana
  billing dashboard.

Rough gameplay math: a bot speaks, votes, and acts maybe 6-10 times per game day. One Fugu Ultra
bot ≈ $4-6 per game day, versus roughly $0.05-0.30 for most of the roster.

## Caching: the layout optimizations that help everyone else do nothing here

We spent 2026-08-04 making every bot's prompt cache-friendly (byte-stable prefixes, explicit
Anthropic breakpoints, provider affinity keys). Cached input costs ~10% of uncached on nearly
every provider — it's the single biggest cost lever for a game that re-sends a growing
conversation every turn.

Fugu Ultra gets nothing from any of it:

- The measured call reported `cached_tokens: 0` AND `orchestration_input_cached_tokens: 0` —
  **even though the byte-identical prompt had been sent minutes earlier.** No cross-request
  prefix reuse at all in our observations.
- When Fugu does report cached tokens, it's typically its own internal passes hitting the shared
  prefix *within a single request* — self-caching of the orchestration loop, not the
  turn-to-turn reuse every other provider gives. Fugu's `cached_tokens` is not a cache-health
  signal in the normal sense.
- The 16s fast run had zero cached tokens too — so the occasional speed-ups aren't cache warmth,
  they're the loop choosing to be shallow.

## The verdict

Fugu's architecture is genuinely interesting — inference-time orchestration is Sakana's research
identity, and for a single hard problem where you'd happily trade minutes and dollars for
quality, it may earn its bill. A turn-based social deduction game is close to the worst case for
it: many small conversational turns, latency directly visible to a waiting human, cost dominated
by re-sent context that Fugu won't cache, and a per-call price driven by hidden work whose depth
you can't control or predict.

Decision: remove Fugu Ultra from the roster (base `fugu` already retired), replace the slot with
Qwen 3.8 Max and MiniMax. Checklist and status live in `bugs-and-future-improvements.md`.
