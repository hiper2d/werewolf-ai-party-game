# Bugs and improvements

## Open
- Improve buttons and summary loder: 
  - Start Night, Next Day, Replay Night (hide it to PAID tier only)
  - Summary in-progress notification is ugly

- Cinematic mode should be on/off

- Create a welcome game for new users? Randomly create a game with free tier models in a predefined theme in the WELCOME state.
Every new user gets one.

- **Cost-accounting loose ends.** The main fix shipped 2026-08-04 (all 9 providers feed cache hits
  into `calculate*Cost`). Still outstanding:
  - *Mistral hit reporting looks model-dependent.* Live runs show Magistral returning
    `prompt_tokens_details.cached_tokens` (up to 99% of input cached) while
    mistral-large/medium/small consistently report 0. Watch the temporary
    `MISTRAL_CACHE_CALIBRATION` log lines in BetterStack over one real game, then remove the log
    from `mistral-agent.ts` (still present at `mistral-agent.ts:146,149`).
  - *Anthropic cache writes are priced at 1.0x instead of 1.25x* — no `cacheWritePrice` field in
    `MODEL_PRICING`, so ~20% undercount on the written span only, on cold calls only. Add the
    field if this ever matters.
  - *Fugu orchestration tokens* are still dropped by `extractTokenUsage` (~2.3-2.9x undercount).
    Moot once Sakana Fugu Ultra is removed from the catalog.

- **Resolve vote tie by asking the Detective to choose.** Today `selectEliminatedPlayer`
  (`app/api/vote-utils.ts`) breaks a tie by picking a random tied bot, never the human.

- **When night starts, the Game Master's messages should tell the human player what to do when
  it's their turn.**

- **Change bots prompting to explain that random voting is not something suspicious.** People do
  this. Maybe add it to personalities.

- **Image generation: one Google 504 aborts a whole illustration set.**
  `generateImage` (`app/utils/avatar-generation.ts:122`) is a bare `fetch` with no explicit
  timeout - any non-2xx throws at `:138`, which unwinds the entire `drawIllustrationSet`
  call in `avatar-drafts.ts:186`. Images already paid for in that set are written off through
  `recordAbandonedSpend` (`:223`). Observed 2026-09-02: three `HTTP 504 / deadline_exceeded` from
  `generativelanguage.googleapis.com` inside 30 minutes (19:27:13, 19:32:18, 19:56:02 UTC). Two hit
  the scene path, which degrades gracefully (completes with `scenes: 0`, logged `warn`); the middle
  one hit the portrait path and killed the draft with $0.067 abandoned. It self-recovered on the
  next attempt, and `hadSet` was true so the player kept the previous set. First occurrence in 30
  days of logs, and it was a local dev session rather than a paying user.
  **Decision 2026-09-02: NO automatic retries** - same rule as LLM calls: the failure surfaces
  and the user triggers the redraw themselves (the draft UI already allows it). What may still
  be worth doing: an explicit timeout on the fetch so a hung call fails on our clock rather than
  Google's, and making sure the abandoned-spend path is the exception, not the rule.

## Reference: prompt-cache semantics per provider (researched 2026-08-04, from live docs)

Kept as reference rather than as a task — the caching work itself is done. Conclusion: **one
prefix-stable layout serves everyone.** Anthropic is the only provider needing explicit markers;
the other 8 cache implicitly on exact-prefix matching. The only provider-conditional pieces are
(a) Anthropic `cache_control` blocks, (b) affinity keys for xAI (`x-grok-conv-id`) and Mistral
(`prompt_cache_key`), (c) per-provider usage-field mapping.

| Provider | Type | Min prefix | TTL | Read price | Hit usage field |
|---|---|---|---|---|---|
| Anthropic | explicit breakpoints (max 4; also top-level auto mode) | 512 (Claude 5 fam), 1024 (Sonnet 4.x), 4096 (Haiku 4.5) | 5 min, reads refresh; 1h = 2x write | 0.1x (write 1.25x) | `cache_read_input_tokens` (+`cache_creation_input_tokens`) |
| OpenAI | auto; explicit `prompt_cache_breakpoint` on GPT-5.6+ | 1024 | ≥30 min (5.6+); 5-10 min older | ~0.1x (write 1.25x on 5.6+, free before) | `prompt_tokens_details.cached_tokens` |
| xAI Grok | auto, server-affinity via `x-grok-conv-id` | undocumented | none (eviction-based) | 0.15-0.20x per model, NOT uniform | `prompt_tokens_details.cached_tokens` |
| Google | implicit on by default (2.5+); explicit = storage $/hr, avoid | 2048 (2.5), 4096 (3.x) | undocumented (implicit) | 0.1x | `usageMetadata.cachedContentTokenCount` |
| DeepSeek | auto disk cache | 64 (64-token units) | hours to DAYS - only cache that survives overnight pauses | ~0.02x on v4-flash | `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` (top-level) |
| Mistral | `prompt_cache_key` param; else undocumented | undocumented | undocumented | 0.1x | NONE documented - verify empirically |
| Kimi | auto only (legacy paid cache API is gone from docs) | 256 | undocumented | ~0.1x (k3: $0.30 vs $3) | **top-level `usage.cached_tokens`** (third wire shape!) |
| GLM/Z.ai | implicit only | undocumented | undocumented ("reasonable") | ~0.19x on GLM-5.2 | `prompt_tokens_details.cached_tokens` |
| Sakana Fugu | auto; base `fugu` router defeats it (~2% hits observed) | undocumented | undocumented | 0.1x (ultra $0.50 vs $5) | `prompt_tokens_details.cached_tokens` (much of it Fugu's own orchestration loop, appears even cold) |

Other findings worth keeping:

- Cache reads DO refresh the TTL ("The cache is refreshed for no additional cost each time the
  cached content is used"), which is what makes the shared tier-1 entry effectively immortal
  during play.
- Anthropic combines consecutive same-role messages into one turn but keeps separate content
  blocks, so the trailing-reminder-as-its-own-message shape is legal and cache-compatible.
- Anthropic has a 20-block lookback per breakpoint. Not a constraint here: `flushGmMessages` in
  `message-utils.ts` collapses every GM command and every other player's line between one bot's
  turns into a single user block, so each turn grows a bot's history by ~2 blocks.
- Anthropic documents `max_tokens: 0` as a cache pre-warm call.
- **Do not chase explicit caching on Google or Kimi.** Both bill storage per hour of retention.
  The game is async with hours or days between phases and every bot has its own prefix, so we
  would pay to store 12 objects through long idle gaps for calls that may never come. The same
  arithmetic rules out Anthropic's 1-hour TTL (2x write cost).
- **Haiku starts a day late.** Haiku 4.5 needs a 4096-token minimum cacheable prefix. On day 1 the
  summaries are empty so the prefix is ~3k tokens and no tier activates; from day 2 it clears the
  bar. Don't read day-1 Haiku zeros as a broken implementation.
- **Where the cache actually invalidates:** not during the night. `night-actions.ts:303` defers
  deaths to `startNewDay` (`:949`) and role knowledge is built there too, so the prompt is
  byte-stable from the start of a day through the end of its night. The churn is three back-to-back
  invalidations at the day boundary: vote resolution (`bot-actions.ts:952-986`), `startNewDay`,
  then each bot appending its own summary to `bot_context`.

## `Game action failed: <single letter>` - minified function name in error logs (found 2026-09-11)

**Symptom.** BetterStack shows a steady stream of *new* error fingerprints with messages like
`Game action failed: t`, `Game action failed: e`. On 2026-09-11 it logged 22 new fingerprints in
90 minutes across 6 game turns. Marlow's monitor pages urgent on every fresh fingerprint, so this
generates alerts continuously and had been written off in her working memory as a
"presence-model design gap, noisy by construction."

**It isn't a design gap, it's a two-line logging bug.** `withErrorHandling`
(`app/utils/server-action-wrapper.ts:67`) derives the log label from the function object:

```ts
const fnName = fn.name || 'anonymousAction';
```

The existing comment anticipates an *empty* `fn.name` for anonymous arrows. What it does not
anticipate is a **minified** one: in a production Next.js build these wrapped server actions come
through as single letters. So `fn.name` is truthy, the fallback never fires, and the letter lands
in both the log message (`Game action failed: ${fnName}`, `:119`) and the `function:` context field.

Two consequences, both bad:

1. **The alert stream is garbage.** BetterStack fingerprints on message text, so every distinct
   minified letter is a brand-new signature, and letters get reshuffled on each deploy. A handful
   of real failures presents as dozens of novel error types.
2. **The logs are unattributable.** `function: "t"` cannot be traced back to `vote`, `talkToAll` or
   `summarizing current day`. The paired `console.error` on `:131` has the same value, so the only
   way to identify the failing action today is the stack in `details`.

**Fix.** Add an explicit name rather than relying on a runtime identifier that the bundler owns:

```ts
export function withErrorHandling<T extends any[]>(
  fn: (...args: T) => Promise<GameActionResponse>,
  gameIdExtractor: (...args: T) => string,
  actionName?: string,
) { ... const fnName = actionName ?? fn.name ?? 'anonymousAction'; }
```

then pass the literal at each wrap site. A cheaper stopgap that fixes the alerting but not the
attribution: treat a `fn.name` of length 1-2 as unusable and fall back to `'gameAction'`, which at
least collapses the fingerprints into one.

**Note on severity.** Marlow's read that the underlying failures are the known recoverable,
single-game-scoped class looks right, and this bug does not change that. What it changes is that
the noise was blamed on the game's design when the cause is the log label, so the alerting was
accepted as unfixable when it is a small change.
