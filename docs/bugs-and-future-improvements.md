# Bugs and improvements

## Open

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
