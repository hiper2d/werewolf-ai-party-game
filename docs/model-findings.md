# Model findings: Fugu Ultra, Qwen, MiniMax — live-test measurements

Source notes for a media write-up, merged 2026-08-05 from `fugu-ultra-findings.md` and
`qwen-minimax-findings.md`, with the full-roster benchmark sweep and a run-to-run variance
reconstruction appended. All numbers measured 2026-08-04/05 against the live provider APIs,
using this game's real prompts — the same day-2 vote with full game context that every model in
the roster answers (`all-models.test.ts`; per-run reports in `logs/live-perf-*.md`). Caveat
everywhere below: single-digit sample counts, not a benchmark — but the effects discussed are
5-10x, not 5-10%.

---

## Part 1 — Sakana Fugu Ultra: why we migrated it out

> **Status update 2026-08-05:** all 23 production games holding a Fugu Ultra bot were migrated
> to DeepSeek V4 Pro (`scripts/migrate-fugu-to-deepseek.ts`). The model itself is still in the
> catalog/picker; full removal is the remaining step.

### What Fugu is

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
- **`fugu-ultra`** — the flagship, with published pricing. The subject of the rest of this part.

### Speed: in a different league, and not in the good way

One identical day-2 vote per model, run sequentially in one session (2026-08-04):

| Rank | Model | Time |
|---|---|---|
| fastest | Mistral 4 Small | 1.3s |
| median of the roster | most models | 3-12s |
| second slowest | GLM-5.2 (Thinking) | 25.4s |
| slowest | **Sakana Fugu Ultra** | **>180s (hit the 3-minute test timeout)** |

Repeat runs of the same call: **174.4s** (passed with 5.6s to spare), **>180s** (timed out), and
once **16.2s**. The 2026-08-05 sweeps added 207.1s, 219.4s, and 226.2s. So it's 7-11x slower
than the second-slowest model on a typical run — and occasionally fast, which is almost worse:
the variance is the model's own internal loop deciding how many passes the problem deserves.
Same prompt, same day, 10x latency spread. There is no knob that makes it predictable.

For a turn-based party game where 12 bots take turns talking, a 3-minutes-per-reply bot means
the human stares at a "thinking" indicator for the length of a pop song, per turn, per Fugu bot.

### Price: $0.59 for a four-sentence vote, and 65% of it is invisible

The itemized usage for one successful vote call (Kenji, day-2 context), from the
`FUGU_COST_CALIBRATION` raw-usage logging in `fugu-agent.ts`:

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

### Caching: the layout optimizations that help everyone else do nothing here

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

### The verdict

Fugu's architecture is genuinely interesting — inference-time orchestration is Sakana's research
identity, and for a single hard problem where you'd happily trade minutes and dollars for
quality, it may earn its bill. A turn-based social deduction game is close to the worst case for
it: many small conversational turns, latency directly visible to a waiting human, cost dominated
by re-sent context that Fugu won't cache, and a per-call price driven by hidden work whose depth
you can't control or predict.

Decision: remove Fugu Ultra from the roster (base `fugu` already retired), replace the slot with
Qwen 3.8 Max and MiniMax. Games migrated 2026-08-05 (see status note above); catalog removal
pending.

---

## Part 2 — Qwen (3.8 Max / 3.7 Plus / 3.7 Flash) and MiniMax M3: the replacements

Measured 2026-08-05 against the live QwenCloud and MiniMax APIs, same day-2 vote prompt
(~8.2k input tokens as these providers tokenize it).

### What they are

Both are conventional OpenAI-compatible reasoning models — no hidden orchestration, no
nonstandard billing fields. They joined the catalog on the day it went **thinking-only**, so all
four entries always run with reasoning enabled:

- **Qwen3.8 Max** — Alibaba's flagship (2.4T-parameter MoE, 1M context, released 2026-08-03).
  $2/M input, $6/M output.
- **Qwen3.7 Plus / Qwen3.7 Flash** — the balanced and budget tiers. Plus $0.40/$1.60, Flash
  $0.03/$0.13 (both tiered up at long context; see pricing notes).
- **MiniMax M3** — 1M context, "adaptive thinking" (the model decides per-request how much to
  reason). $0.30/$1.20 with a "permanent 50% off" already baked into the rate card.

### Speed: the reasoning-length lottery, again — but this time there's a knob

Fugu's core problem was latency variance driven by internal work we couldn't control. The Qwen
models reproduced the same pattern in miniature, uncapped:

| Model | Uncapped day-2 vote runs | Output tokens (mostly reasoning) |
|---|---|---|
| Qwen3.7 Flash | 14.3s, 16.4s, 21.0s | 1,897 / 1,912 / 3,035 |
| Qwen3.7 Plus | 17.4s, 14.5s, 22.9s | 952 / 780 / 1,262 |
| **Qwen3.8 Max** | **30.6s, 100.5s, 81.9s** | 1,149 / **4,169** / 3,363 |

Same prompt, same day, and Max decided one request deserved 3.6x more thinking — a 100-second
turn, deep in Fugu territory. Latency for all three tracks reasoning length almost linearly.

The difference from Fugu: Qwen exposes a **`thinking_budget`** parameter. We capped all three
models at **1,024 reasoning tokens**, trading depth for predictability — a poor but bearable
performance, deliberately: less thinking than the model wants, but turns a human will actually
wait through:

| Model | Capped at 1,024 | Grade |
|---|---|---|
| Qwen3.7 Flash | 8.4s | untagged middle bucket |
| Qwen3.7 Plus | 12.9s | untagged middle bucket |
| Qwen3.8 Max | 25.4s (was 30-100s) | `very slow` |

(Tags in the picker deliberately stay pessimistic — `slow` for Flash/Plus, `very slow` for Max —
because these are single samples and the cap bounds the worst case rather than the average. The
evening full sweep vindicated that call: capped Flash/Plus still hit 10.5s/31s under provider
load.)

**MiniMax M3 has no such knob.** Its "adaptive" thinking is the only throttle, and it measured
25.3s on the vote (1,216 output tokens) and 10.5s on a light plain-text turn. That lands it in
the same `very slow` cluster as capped Qwen Max and Kimi K3. If M3 ever shows Qwen-Max-style
runaways in real games, the only lever is disabling thinking entirely.

### Price: two orders of magnitude below Fugu, and the caching actually works

Cost per day-2 vote, as measured:

| Model | Per vote | Notes |
|---|---|---|
| Qwen3.7 Flash | $0.0004-0.0006 | cheapest reasoner in the roster after DeepSeek |
| Qwen3.7 Plus | $0.0024-0.0053 | |
| Qwen3.8 Max | $0.0234 / $0.0415 uncapped → **$0.0115** capped+cached | the 4.2k-token think cost 1.8x the normal one |
| MiniMax M3 | $0.0038-0.0052 | |
| (Fugu Ultra, same prompt) | $0.585 | ~65% invisible orchestration |

Rough gameplay math (6-10 actions per bot per game day): one Qwen Max bot ≈ $0.07-0.20/day, one
MiniMax bot ≈ $0.02-0.04/day, Flash effectively free — versus $4-6/day for the Fugu bot they
replaced.

Three pricing details worth remembering:

- **The budget cap is a cost control too.** Reasoning bills at the output rate, so Qwen Max's
  runaway think doubled the call's price ($0.042 vs $0.023). Capping thinking capped the bill.
- **Qwen3.8 Max's rate card is launch-coverage sourced** ($2/$6 from OpenRouter and press; the
  official docs defer to a Model Marketplace page WebFetch can't read). Third parties quote
  cached input at $0.25/M, which contradicts QwenCloud's documented implicit-cache rule (20% of
  input = $0.40). We charge the documented $0.40 to avoid a Fugu-style undercharge; reconcile
  against the console bill after the first real games.
- **Qwen3.7 Flash actually has three price tiers** (≤32K: $0.03/$0.13, 32K-256K: $0.10/$0.40,
  256K-1M: $0.20/$0.80) while our pricing schema models one threshold. We bill the middle tier
  above 32K, knowingly undercharging 2x past 256K — game contexts essentially never get there.

Free-tier banding: all four are "hybrid" models (their APIs offer a thinking toggle we always
enable), so they pay the 2.5x effective-price multiplier. That lands Flash unlimited, Plus and
M3 at 3 bots/game, Max at 1 bot/game.

### Caching: everything Fugu refused to do

- **MiniMax reported `cached_tokens: 128` on the very first probe call** — its automatic caching
  (≥512 input tokens, no parameters needed) was hitting before we'd done anything deliberate.
  Cache reads bill at $0.06/M — 5% of the input price, the deepest cache discount in the roster.
- **Qwen's implicit cache halved a real call's cost between runs**: Qwen Max's capped vote cost
  $0.0229 on a cold prompt and $0.0115 minutes later on the byte-identical one, with hits billed
  at 20% of input. QwenCloud also offers Anthropic-style explicit `cache_control` breakpoints
  (125% to write, 10% to read, 5-min TTL) if we ever want guaranteed hits; implicit is free and
  has been sufficient.
- Both report hits in the standard `prompt_tokens_details.cached_tokens` field, so our existing
  cost tracking needed zero changes — unlike Fugu's nonstandard orchestration fields that
  silently hid 65% of the bill.

### Quirks that shaped the integration

- **Qwen refuses JSON mode while thinking** (`response_format` is non-thinking-only), and
  **MiniMax's M-series has no `response_format` at all** — so both agents enforce the response
  schema in-prompt with lenient parsing. All live vote tests validated cleanly regardless.
- **MiniMax embeds its reasoning as `<think>` tags inside the answer** unless you send
  `reasoning_split: true`. We always send it (and strip stray tags defensively) — without that,
  every JSON reply would arrive wrapped in chain-of-thought.

### The verdict

Kept, all four. They inherit Fugu's roster slot at 1-2% of its cost, with working caches,
standard billing, and — for Qwen — a real lever over the latency-variance problem that killed
Fugu. The price of that lever is honesty about what it does: a 1,024-token thinking budget is
thinner reasoning than these models would choose for themselves. Bearable beats brilliant-but-
three-minutes; whether it also beats the mid-roster models at actually playing the game is what
the reasoning stats from real games will tell us.

---

## Part 3 — Full-roster live sweep (2026-08-05, 20:52 UTC)

The complete current roster (24 models, post-thinking-only catalog, Qwen capped at 1,024
reasoning tokens), one identical day-2 vote each, run sequentially. Input counts differ per
model despite the byte-identical prompt: tokenizers differ (~8k for most, ~12.1k for OpenAI,
~13k for Claude's newer tokenizer which runs ~30% heavier, 8.9k for Haiku's older one), and
Claude rows include cache-breakpoint system-prompt structure. The column shows what each
provider bills for our context, not a tokenizer-neutral length.

| Model | Time | Input | Output | Total | Cost |
|---|---:|---:|---:|---:|---:|
| Mistral Large 3 | 3.13s | 8,175 | 73 | 8,248 | $0.0042 |
| GPT-5.6 Terra | 3.59s | 12,124 | 184 | 12,308 | $0.0265 |
| GPT-5.6 Luna | 3.61s | 12,124 | 231 | 12,355 | $0.0027 |
| Magistral Medium 1.2 | 3.77s | 8,175 | 61 | 8,236 | $0.0167 |
| Gemini 3.5 Flash Lite | 4.53s | 7,979 | 652 | 8,631 | $0.0034 |
| Gemini 3.6 Flash | 4.59s | 7,979 | 297 | 8,276 | $0.0142 |
| Mistral 4 Small | 5.31s | 8,175 | 66 | 8,241 | $0.0013 |
| Claude 5 Opus | 5.88s | 13,027 | 291 | 13,318 | $0.0724 |
| Claude Fable 5 | 5.97s | 13,027 | 209 | 13,236 | $0.1407 |
| Claude 5 Sonnet | 6.80s | 13,027 | 252 | 13,279 | $0.0429 |
| GPT-5.6 Sol | 7.29s | 12,124 | 155 | 12,279 | $0.0653 |
| Qwen3.7 Flash | 10.5s | 8,216 | 1,093 | 9,309 | $0.0004 |
| Gemini 3.1 Pro Preview | 12.1s | 7,979 | 940 | 8,919 | $0.0272 |
| Grok 4.5 | 14.8s | 8,190 | 607 | 8,797 | $0.0198 |
| GLM-5.2 | 16.4s | 8,150 | 1,211 | 9,361 | $0.0167 |
| DeepSeek V4 Pro | 22.2s | 8,164 | 1,392 | 9,556 | $0.0013 |
| Mistral Medium 3.5 | 24.1s | 8,175 | 57 | 8,232 | $0.0127 |
| Qwen3.8 Max | 27.3s | 8,250 | 1,159 | 9,409 | $0.0235 |
| Claude 4.5 Haiku | 29.4s | 8,906 | 2,635 | 11,541 | $0.0221 |
| DeepSeek V4 Flash | 30.1s | 8,243 | 2,275 | 10,518 | $0.0007 |
| MiniMax M3 | 30.4s | 8,037 | 2,381 | 10,418 | $0.0052 |
| Qwen3.7 Plus | 31.0s | 8,216 | 1,158 | 9,374 | $0.0051 |
| Kimi K3 | 31.2s | 8,192 | 1,103 | 9,295 | $0.0411 |
| Sakana Fugu Ultra | 226.2s | 13,812 | 5,157 | 18,969 | $0.2238 |
| **Total (24/24 ✓)** | 560s | | | | **$0.79** |

Cost extremes: Qwen3.7 Flash $0.0004 and DeepSeek Flash $0.0007 at the bottom; Fable $0.141,
Opus $0.072, Sol $0.065 at the top of the normal roster — and Fugu at $0.224 on one of its
*faster* runs.

## Part 4 — Run-to-run variance: the same vote, four sessions

Times only, reconstructed from `logs/live-perf-*.md` plus the 2026-08-04 grading run (which
predates the report files; its numbers survive in code comments and Part 1). Three full sweeps
ran on 2026-08-05: ~17:34 UTC, ~17:43 UTC, and ~20:52 UTC — Qwen was uncapped in the first two
and capped in the third, so its rows change meaning mid-table (marked).

| Model | Aug 4 | Aug 5, 17:34 | Aug 5, 17:43 | Aug 5, 20:52 | Spread |
|---|---:|---:|---:|---:|---|
| Mistral 4 Small | 1.3s | 1.2s | 1.1s | 5.3s | 5x, one evening outlier |
| Magistral Medium 1.2 | — | 1.7s | 1.5s | 3.8s | |
| Mistral Medium 3.5 | — | 3.3s | 3.6s | 24.1s | **7x** — provider hiccup, only 57 output tokens |
| Mistral Large 3 | — | 3.8s | 4.8s | 3.1s | stable |
| GPT-5.6 Luna | — | 3.2s | 3.6s | 3.6s | stable |
| GPT-5.6 Terra | — | 3.5s | 3.8s | 3.6s | stable |
| GPT-5.6 Sol | — | 7.1s | 6.7s | 7.3s | stable |
| Gemini 3.5 Flash Lite | — | 4.5s | 5.3s | 4.5s | stable |
| Gemini 3.6 Flash | — | 7.1s | 6.9s | 4.6s | stable |
| Gemini 3.1 Pro | — | 12.0s | 11.6s | 12.1s | remarkably stable |
| Claude Fable 5 | — | 4.8s | 5.1s | 6.0s | stable |
| Claude 5 Opus | — | 7.8s | 5.9s | 5.9s | stable |
| Claude 5 Sonnet | — | 8.5s | 14.8s | 6.8s | 2x, adaptive thinking |
| Claude 4.5 Haiku | — | 19.7s | 42.0s | 29.4s | **2x**, budget thinking + load |
| DeepSeek V4 Flash | — | 13.3s | 19.3s | 30.1s | 2.3x, reasoning length |
| DeepSeek V4 Pro | — | 14.4s | 14.9s | 22.2s | 1.5x |
| Grok 4.5 | — | 10.6s | 10.0s | 14.8s | stable-ish |
| GLM-5.2 | 25.4s | 19.5s | 21.2s | 16.4s | improving; Aug 4 was the thinking variant |
| Kimi K3 | 17s | 28.9s | 33.5s | 31.2s | **2x** between days, always max effort |
| Qwen3.7 Flash | — | 16.4s | 15.0s | 10.5s *(capped)* | cap helps; solo capped run: 8.4s |
| Qwen3.7 Plus | — | 14.5s | 14.0s | 31.0s *(capped)* | evening load, not reasoning (1.1k out) |
| Qwen3.8 Max | — | **100.5s** | **81.9s** | 27.3s *(capped)* | **4x**, tamed by the 1,024 cap |
| MiniMax M3 | — | — | — | 30.4s | solo runs: 25.3s |
| Sakana Fugu Ultra | 16-180s+ | 207.1s | 219.4s | 226.2s | its own universe |

What the reconstruction says:

- **The bands are stable; the seconds are not.** Non-reasoning and effort-fixed models (Mistral
  Large, GPT-5.6, Gemini) repeat within ±20%. Every model whose reasoning length floats
  (Haiku, DeepSeek, Kimi, uncapped Qwen) swings 2-4x on the identical prompt — which is exactly
  why the speed tags trust buckets, not fine ordering.
- **Two distinct variance sources:** reasoning-length lottery (visible in the output-token
  column — Haiku's 42s run emitted 4,095 tokens vs 1,769 on its 19.7s run) and provider-side
  load (Mistral Medium's 24s run emitted only 57 tokens; Qwen Plus's 31s run stayed capped at
  1.1k). The evening 20:52 sweep ran generally slower than the 17:3x pair.
- **The Qwen cap did what it promised**: Max went from an 81-100s lottery to a repeatable
  25-27s, and the cap is visible in the output column (locked at ~1.1k tokens).
- Your remembered numbers are both real: **GLM 25.4s** is the Aug-4 thinking-variant
  measurement, and **Kimi 17s** is the Aug-4 grading run — Kimi has simply been running slower
  (29-34s) all of Aug 5.

---

## Addendum 2026-08-30 — catalog/pricing refresh

- **GPT-5.6 Sol repriced**: $4 / $20 short context (cached $0.40), $8 / $30 past 272k (cached
  $0.80). Was $5 / $30 flat. Still above the $15 free-tier ceiling.
- **DeepSeek weekends**: since 2026-08-23 (Beijing) the 2× peak surcharge applies Mon–Fri only;
  Saturday/Sunday Beijing time bill off-peak all day. Modelled as `PeakPricing.weekendOffPeak`
  in the library; rates themselves unchanged.
- **GLM-5.3 Flash added** (`glm-5.3-flash`): list $0.15 / $0.50, cached $0.03. Same
  low|high|max `reasoning_effort` contract as GLM-5.3, pinned `high`. A 50% promo runs until
  2026-09-09 (UTC+8); we bill list rate.
- **Qwen**: `qwen3.8-flash` ($0.15 / $0.47, cached $0.016, no input-length tiers) replaces
  `qwen3.7-flash`; `qwen3.7-plus` retired, persisted `qwen-plus` ids resolve to the Flash
  entry. `qwen3.8-max` cached input corrected to the published $0.25 (was the 20%-rule $0.40).
- **DeepSeek `reasoning_effort` pinned to `low`** (both V4 models; the agent now forwards the
  catalog value — it never sent one before, so both ran at the provider default `high`).
  Trigger: prod `requestStats` (30d) showed ~8 reasoning tokens per answer token (flash p50
  8.9s / p90 36s, pro p50 18.9s / p90 56s) and a 15-bot story at 68–105s. Live A/B, same day:

  | | high (default) | low |
  |---|---|---|
  | Flash, day-2 vote | 31.5s, 3,040 out | 5.3s, 383 out |
  | Flash, 15-bot story | 67.9s, 7,097 out | 30.9s, 3,618 out |
  | Flash, welcome text | 9.6s, 674 out | 5.7s, 410 out |
  | Pro, day-2 vote | 16.3s, 802 out | 20.8s, 995 out |
  | Pro, 15-bot story | 104.5s, 6,181 out | 79.3s, 5,142 out |

  Single samples. **Correction, later the same day:** a 3×3 repeat of the Flash vote showed
  no difference (`low` 5.2s/11.7s/6.1s with 370/1,161/436 output tokens vs `high` 5.1s/6.9s/8.0s
  with 380/497/591), and a direct API probe on a 6-character story prompt gave reasoning
  counts of 122 (nothing sent), 764 / 338 (`low`), 39 (`high` — in 196s) — i.e. DeepSeek's
  `reasoning_effort` has **no measurable effect** on our prompts, and the 5s→196s spread is
  provider-side latency, not reasoning length. The `low` pin stays (documented, harmless),
  but the "31s → 5s" reading above was variance, not the parameter.
- **DeepSeek `extra_body` was never reaching the API.** openai-node has no `extra_body`
  (that's the Python SDK); the key went out literally and was ignored. Probe:
  `extra_body: {thinking: {type: 'disabled'}}` still reasoned (1,233 tokens), top-level
  `thinking: {type: 'disabled'}` did not (0). Harmless so far because V4 defaults thinking on
  and the factory always enables it for DeepSeek, but the agent now sends `thinking` at the
  top level, and sends `disabled` explicitly when thinking is off.
- **Per-call reasoning profile** (2026-08-30): `AbstractAgent` now carries `reasoningEffort`
  and `thinkingBudgetTokens` as instance fields (catalog default, overridable like
  `maxOutputTokens`); every effort/budget-aware agent reads the instance field. Story
  generation runs `configureStoryAgent()` — 16k output, effort `high`, budget 8192 — while
  turns stay at the catalog defaults (8k output; DeepSeek pinned `low`, Qwen budget 1024).
  **Qwen's `reasoning_effort` is a no-op**: probed live, every value is accepted but reasoning
  length doesn't track it (qwen3.8-max: low → 1,686 reasoning tokens / 44s, high → 226 / 7s,
  xhigh → 1,102 / 30s); `thinking_budget` bounds it reliably (≤340 at 1024). The Qwen agent
  therefore never sends effort — the budget is its effort knob. Story with the profile:

  | | turn profile (budget 1024 / effort low) | story profile (budget 8192 / effort high) |
  |---|---|---|
  | Qwen3.8 Flash, 15-bot story | 22.2s, 2,738 out | 33.7s, 3,857 out |
  | Qwen3.8 Max, 15-bot story | 58.5s, 3,266 out | 85.7s, 3,844 out |
  | DeepSeek V4 Flash, 15-bot story | 30.9s, 3,618 out | 59.8s, 8,256 out — and one run hit the test timeout (246s) |

  DeepSeek Flash at `high` remains the volatile one: it is the same behaviour that produced the
  67.9s/failed pair earlier in the day. The other three story runs that failed on first attempt
  (two Qwen at ~1–2s) passed on both reruns; cause not captured.

  **Decision (same day): the deep story profile was rejected.** `configureStoryAgent()` now
  only raises the output ceiling to 16k; reasoning stays at the catalog default for the story
  too (DeepSeek `low`, Qwen budget 1024). The per-instance override fields stay in the
  library for future use.
