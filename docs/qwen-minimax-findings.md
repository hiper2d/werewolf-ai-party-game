# Qwen (3.8 Max / 3.7 Plus / 3.7 Flash) and MiniMax M3: pricing and speed findings

Source notes, companion to `fugu-ultra-findings.md` — these are the models that took Fugu's
slot in the roster. All numbers measured 2026-08-05 against the live QwenCloud and MiniMax APIs,
using this game's real prompts (the same day-2 vote with full game context every model in the
roster answers; ~8.2k input tokens as these providers tokenize it). Timings come from the
live-perf reports (`logs/live-perf-*.md`), written by `all-models.test.ts`. Same caveat as the
Fugu doc: single-digit sample counts, not a benchmark — but the patterns repeated across runs.

## What they are

Both are conventional OpenAI-compatible reasoning models — no hidden orchestration, no
nonstandard billing fields. They joined the catalog on the day it went **thinking-only**, so all
four entries always run with reasoning enabled:

- **Qwen3.8 Max** — Alibaba's flagship (2.4T-parameter MoE, 1M context, released 2026-08-03).
  $2/M input, $6/M output.
- **Qwen3.7 Plus / Qwen3.7 Flash** — the balanced and budget tiers. Plus $0.40/$1.60, Flash
  $0.03/$0.13 (both tiered up at long context; see pricing notes).
- **MiniMax M3** — 1M context, "adaptive thinking" (the model decides per-request how much to
  reason). $0.30/$1.20 with a "permanent 50% off" already baked into the rate card.

## Speed: the reasoning-length lottery, again — but this time there's a knob

Fugu's core problem was latency variance driven by internal work we couldn't control. The Qwen
models reproduced the same pattern in miniature, uncapped:

| Model | Uncapped day-2 vote runs | Output tokens (mostly reasoning) |
|---|---|---|
| Qwen3.7 Flash | 14.3s, 16.4s, 21.0s | 1,897 / 1,912 / 3,035 |
| Qwen3.7 Plus | 17.4s, 14.5s, 22.9s | 952 / 780 / 1,262 |
| **Qwen3.8 Max** | **30.6s, 100.5s** | 1,149 / **4,169** |

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
because these are single samples and the cap bounds the worst case rather than the average.)

**MiniMax M3 has no such knob.** Its "adaptive" thinking is the only throttle, and it measured
25.3s on the vote (1,216 output tokens) and 10.5s on a light plain-text turn. That lands it in
the same `very slow` cluster as capped Qwen Max and Kimi K3 (17-29s across samples). If M3 ever
shows Qwen-Max-style runaways in real games, the only lever is disabling thinking entirely.

For reference, the full-roster sweep the same day: fastest models 1-4s (Mistral, GPT-5.6 Luna),
median 3-13s, the reasoning cluster 15-29s, Fugu 207s. The new models sit at the top of the
normal range — slow, not pathological.

## Price: two orders of magnitude below Fugu, and the caching actually works

Cost per day-2 vote, as measured:

| Model | Per vote | Notes |
|---|---|---|
| Qwen3.7 Flash | $0.0004-0.0006 | cheapest reasoner in the roster after DeepSeek |
| Qwen3.7 Plus | $0.0024-0.0053 | |
| Qwen3.8 Max | $0.0234 / $0.0415 uncapped → **$0.0115** capped+cached | the 4.2k-token think cost 1.8x the normal one |
| MiniMax M3 | $0.0038 | |
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

## Caching: everything Fugu refused to do

The 2026-08-04 cache-layout work (byte-stable prefixes, growing-conversation reuse) pays off
immediately on both providers, in exactly the way it never did on Fugu:

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

## Quirks that shaped the integration

- **Qwen refuses JSON mode while thinking** (`response_format` is non-thinking-only), and
  **MiniMax's M-series has no `response_format` at all** — so both agents enforce the response
  schema in-prompt with lenient parsing. All live vote tests validated cleanly regardless.
- **MiniMax embeds its reasoning as `<think>` tags inside the answer** unless you send
  `reasoning_split: true`. We always send it (and strip stray tags defensively) — without that,
  every JSON reply would arrive wrapped in chain-of-thought.

## The verdict

Kept, all four. They inherit Fugu's roster slot at 1-2% of its cost, with working caches,
standard billing, and — for Qwen — a real lever over the latency-variance problem that killed
Fugu. The price of that lever is honesty about what it does: a 1,024-token thinking budget is
thinner reasoning than these models would choose for themselves. Bearable beats brilliant-but-
three-minutes; whether it also beats the mid-roster models at actually playing the game is what
the reasoning stats from real games will tell us.
