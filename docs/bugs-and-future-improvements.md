# Bugs and improvements

## Other improvements / wishlist (not from the test push, not test-pinned)

- **Remove Sakana Fugu Ultra; add Qwen 3.8 Max and MiniMax in its place.** Decided 2026-08-04
  after the speed grading. Full measured write-up (price breakdown, latency runs, orchestration
  design) in `docs/fugu-ultra-findings.md` — written as source notes for a media post. Fugu Ultra's live numbers: 16s-180s+ latency on the same day-2 vote
  call (variance is its internal orchestration loop, not load), tagged `extremely-slow` in the
  picker for now. One vote call measured via `FUGU_COST_CALIBRATION`: 13.7k visible prompt +
  25.2k orchestration-input tokens billed at input rate, 4.5k visible completion + 8.5k
  orchestration-output at output rate ≈ **$0.59 real for a single vote**, of which our cost
  tracker records only ~$0.20 (orchestration tokens dropped — the known undercount, now
  quantified at ~2.9x on this call). Zero cache utilization: `cached_tokens: 0` AND
  `orchestration_input_cached_tokens: 0` even with the identical prompt sent minutes earlier.
  - *Removal checklist:* `FUGU_ULTRA` from `LLM_CONSTANTS`/`SupportedAiModels`/`MODEL_PRICING`,
    `fugu-agent.ts` + factory wiring, `FUGU_API_KEY` from key constants/profile page, map both
    `'fugu'` and `'fugu-ultra'` in `DEPRECATED_MODEL_MAP` to a replacement (base `fugu` already
    maps to `FUGU_ULTRA`, so it needs re-pointing in the same change), remove the
    `FUGU_COST_CALIBRATION` logging and the Fugu branch notes in `token-usage-utils.ts`, and
    scrub `all-models.test.ts`.
  - *Additions:* **Qwen 3.8 Max** (Alibaba/DashScope, OpenAI-compatible endpoint) and
    **MiniMax** (OpenAI-compatible). Before wiring: check per-model pricing + free-tier banding,
    thinking/reasoning knobs, which usage field reports cache hits, and caching semantics
    (implicit? key-routed? min prefix/TTL) so they slot into the 2026-08-04 provider cache table
    below. Both are one-agent-file additions if their OpenAI compatibility is real.

- **[TOP PRIORITY] Auto-correction round on a night-action validation failure.** Small models fail
  the STRICT target-name constraint by naming a dead/invalid player (observed 2026-07-26:
  mistral-medium-3 as maniac Jace returned `target: "Rook"` - a corpse - twice, while its own
  reasoning correctly said "Rook is dead, target Selkie"). The `BotResponseError` already carries
  `{selectedTarget, availableTargets, recoverable:true}`; instead of surfacing Retry on first
  failure, append that rejection to the model's history ("You chose Rook. Rook is dead. Choose
  EXACTLY from: ...") and re-ask ONCE before giving up. Applies to maniac/doctor/detective/werewolf
  processors. Bare-retry replays identical context and fails identically - this is the real fix.
  (The companion fix — a one-shot "Retry with different model" — shipped 2026-07-26, see Done below.)
- **[MONEY] Cost accounting drops cache-hit tokens — ✅ FIXED 2026-08-04** (details in the Done
  section below). All 9 providers now feed cache hits into `calculate*Cost`. Remaining loose ends:
  - *Mistral hit reporting looks model-dependent in practice.* Live runs show Magistral returning
    `prompt_tokens_details.cached_tokens` (up to 99% of input cached) while
    mistral-large/medium/small consistently report 0. Watch the temporary
    `MISTRAL_CACHE_CALIBRATION` log lines in BetterStack over one real game, then remove the log
    from `mistral-agent.ts`.
  - *Anthropic cache writes are priced at 1.0x instead of 1.25x* (no write-premium field in
    `MODEL_PRICING`) — ~20% undercount on the written span only, on cold calls only. Add a
    `cacheWritePrice` field if this ever matters.
  - *Fugu orchestration tokens* are still dropped by `extractTokenUsage` (the known ~2.3x
    undercount) — separate item, unchanged by this work.
- **Use manual cache breakpoints where the provider supports them, in two tiers. — ✅ IMPLEMENTED
  2026-08-04** (all three tiers live; see the Done section). Design notes below kept for the
  reasoning; the [BRAINSTORM LATER] TTL-sharing argument is now realized via the shared tier-1
  entry.
  - *Tier 1 (shared, never invalidates):* end of the static rules block, once the character identity
    is moved below it. Byte-identical across all 12 bots and across games with the same rule set, so
    one org-level cache entry serves everything.
  - *Tier 2 (slow - one game day):* end of the system prompt, after the accumulated day summaries.
    Invalidates once per day boundary when summarization appends the new day. This is the tier the
    layout work is meant to protect.
  - *Tier 3 (fast - one turn):* end of the message history. **Do NOT put this on the last message.**
    The reminder is appended to the final GM command and then not persisted, so that position is
    re-sent with different bytes next turn and the breakpoint can never be read - a 1.25x write
    every turn for zero hits. Anchor it on the last *persisted* message, one position back. General
    rule: only breakpoint content that will be re-sent byte-identically on the next request.
  - *The reminder itself is cheap and does not need fixing.* Prefix matching means stripping it only
    invalidates from that message onward; the system prompt and all older history still hit. Volatile
    content living after everything cacheable is the recommended shape, which this already is.
  - *Optional refinement, needs verification:* the reminder text is stable per bot (`play_style` and
    `human_player_name` don't change), so the churn comes from concatenating it onto a message that
    is later re-sent without it. Sending it as its own trailing message would keep the GM command
    byte-stable and push all divergence into the throwaway tail. Consecutive same-role messages are
    legal; confirm with `cache_read_input_tokens` before relying on it.
  - *Limits to respect:* max 4 breakpoints per request, so three tiers leaves one spare. The
    20-content-block lookback limit is NOT a concern here: `flushGmMessages` in `message-utils.ts`
    collapses every GM command and every other player's line between one bot's turns into a single
    user block, so each turn grows that bot's history by ~2 blocks. The router flattening keeps us
    far inside the window.
  - *Haiku starts a day late.* Haiku 4.5 needs a 4096-token minimum cacheable prefix. On day 1 the
    summaries are empty so the prefix is ~3k tokens and no tier activates; from day 2 the
    accumulated history clears the bar. Not a design problem, just don't read day-1 Haiku zeros as
    a broken implementation. Every other model is over the minimum immediately.
  - *Do not chase explicit caching on Google or Kimi.* Both offer an opt-in cache API on top of
    their automatic caching, but those bill storage per hour of retention. The game is async with
    hours or days between phases, and every bot has its own prefix, so we would pay to store 12
    objects through long idle gaps for calls that may never come. Same arithmetic rules out
    Anthropic's 1-hour TTL (2x write cost) - use the default 5-minute TTL, which has no storage fee
    and is long enough for the back-to-back calls inside a day discussion.
  - *Breakpoints do not accumulate.* They are positions declared per request, not persistent
    objects. Every request carries at most 4 markers and we re-declare all of them each time: the
    slow one on the same system-prompt content, the fast one moved forward to the newest persisted
    message. Creating fast breakpoints can never dislodge the slow one - different positions, read
    independently, and the limit of 4 is per request rather than a running total.
  - *[BRAINSTORM LATER] What actually threatens the slow entry is TTL, not count - and per-bot
    prefixes make it fragile.* Default TTL is 5 minutes, refreshed on each read, so an active
    discussion keeps an entry warm indefinitely. But every bot has its own system prompt, therefore
    its own entry, kept alive only by that bot's own calls. The router picks 2-5 bots per batch out
    of 12, so a bot passed over for a few rounds goes cold and repays the full write next time it
    speaks - and the quiet ones are exactly the ones `NEEDS TURN` exists to rescue. This is the
    strongest argument for moving character identity below the rules: it turns 12 independently
    expiring per-bot entries into one shared entry that ANY bot's call refreshes, which with 12 bots
    taking turns would essentially never expire during play. The only alternative lever is
    per-breakpoint TTL (`{type:'ephemeral', ttl:'1h'}`, mixable within a request), and it is a bad
    trade here: 2x write cost to survive gaps that are usually overnight anyway, since the game is
    explicitly designed to be paused for a day and resumed.
  - *CONFIRMED 2026-08-04:* cache reads DO refresh the TTL. Doc language: "The cache is refreshed
    for no additional cost each time the cached content is used." The sharing argument above holds.
    (Still worth eyeballing `cache_read_input_tokens` in a real game as a sanity check.)
  - *✅ RESEARCH DONE (2026-08-04): cache semantics for all 9 providers, from live docs.*
    Conclusion: **one prefix-stable layout serves everyone.** Anthropic is the only provider
    needing explicit markers; the other 8 cache implicitly on exact-prefix matching. The only
    provider-conditional pieces are (a) Anthropic `cache_control` blocks, (b) affinity keys for
    xAI (`x-grok-conv-id` header - we don't send it, so Grok hits are luck-of-the-server today)
    and Mistral (`prompt_cache_key` param), (c) per-provider usage-field mapping.
    | Provider | Type | Min prefix | TTL | Read price | Hit usage field |
    |---|---|---|---|---|---|
    | Anthropic | explicit breakpoints (max 4; also new top-level auto mode) | 512 (Claude 5 fam), 1024 (Sonnet 4.x), 4096 (Haiku 4.5) | 5 min, reads refresh; 1h = 2x write | 0.1x (write 1.25x) | `cache_read_input_tokens` (+`cache_creation_input_tokens`) |
    | OpenAI | auto; explicit `prompt_cache_breakpoint` on GPT-5.6+ | 1024 | ≥30 min (5.6+); 5-10 min older | ~0.1x (write 1.25x on 5.6+, free before) | `prompt_tokens_details.cached_tokens` |
    | xAI Grok | auto, server-affinity via `x-grok-conv-id` | undocumented | none (eviction-based) | 0.15-0.20x per model, NOT uniform | `prompt_tokens_details.cached_tokens` |
    | Google | implicit on by default (2.5+); explicit = storage $/hr, avoid | 2048 (2.5), 4096 (3.x) | undocumented (implicit) | 0.1x | `usageMetadata.cachedContentTokenCount` |
    | DeepSeek | auto disk cache | 64 (64-token units) | hours to DAYS - only cache that survives overnight pauses | ~0.02x on v4-flash | `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` (top-level) |
    | Mistral | `prompt_cache_key` param; else undocumented | undocumented | undocumented | 0.1x | NONE documented - verify empirically |
    | Kimi | auto only (legacy paid cache API is gone from docs) | 256 | undocumented | ~0.1x (k3: $0.30 vs $3) | **top-level `usage.cached_tokens`** (third wire shape!) |
    | GLM/Z.ai | implicit only | undocumented | undocumented ("reasonable") | ~0.19x on GLM-5.2 (pricing page beats the stale "50%" cache doc) | `prompt_tokens_details.cached_tokens` |
    | Sakana Fugu | auto; base `fugu` router defeats it (~2% hits observed) | undocumented | undocumented | 0.1x (ultra $0.50 vs $5; cyber $0.60 vs $6) | `prompt_tokens_details.cached_tokens` (much of it is Fugu's own internal orchestration loop, appears even cold) |
    Other findings: Anthropic combines consecutive same-role messages into one turn but keeps
    separate content blocks, so the trailing-reminder-as-own-message trick is legal and
    cache-compatible (breakpoint on the command block, reminder block after it). Anthropic has a
    20-block lookback per breakpoint (fine - `flushGmMessages` keeps block counts low). Anthropic
    also documents `max_tokens: 0` as a cache pre-warm call. Grok cached price varies per model,
    so `calculateGrokCost` needs per-model cached rates, not one ratio.
- **Prompt caching is completely off for Anthropic bots, and the system prompt layout fights the
  cache.** Two separate problems, found 2026-08-03 while answering a reader question on the
  architecture article.
  - *No breakpoint — ✅ FIXED 2026-08-04.* `anthropic-agent.ts` now sets two explicit
    `cache_control` markers per request: one on the system prompt (slow tier, stable within a
    game day) and one on the second-to-last message via `applyCacheBreakpoint` (fast tier — the
    last message that is re-sent byte-identically; the final message carries the unpersisted
    reminder/schema tail, so a marker there would never be read). Verified against the live API:
    writes on first call, reads (~0.1x price) on repeat calls. NOTE: Anthropic's top-level
    "automatic caching" mode was evaluated and rejected — it targets the LAST cacheable block,
    which for us is exactly the never-repeated tail; every entry it wrote would be dead. Explicit
    breakpoints stay even after the reminder is detached.
  - *Blind accounting — ✅ FIXED 2026-08-04.* `buildTokenUsage` in `anthropic-agent.ts` now reads
    `cache_read_input_tokens` + `cache_creation_input_tokens`, reconstructs the full prompt size
    (Anthropic's `input_tokens` excludes cached tokens), and passes cache hits into
    `calculateAnthropicCost`. Known approximation: cache WRITES bill at 1.25x but are priced at
    1.0x (no write-premium field in `MODEL_PRICING`) — ~20% undercount on the written span only.
  - *Identity above the rules — ✅ FIXED 2026-08-04.* `BOT_SYSTEM_PROMPT` now leads with the
    placeholder-free shared rules (the coffee example was depersonalized), followed by
    `CACHE_TIER_MARKER`, then identity / human-player section / Game State + `%bot_context%` at
    the very end. `AbstractAgent` splits the instruction on the marker; `ClaudeAgent` emits one
    cacheable system block per tier, so the rules tier is one org-level entry that ANY bot's call
    refreshes. Pinned by `cache-tiers.test.ts` (shared tier byte-identical across bots).
  - *Volatile block sits mid-prompt — ✅ FIXED 2026-08-04.* Game State + `%bot_context%` moved to
    the very end of the system prompt (nothing static after them). Alive/dead stayed in the
    system prompt rather than moving to the reminder: deaths only change in `startNewDay`, i.e.
    exactly when the per-bot tier rewrites anyway, so moving them bought nothing.
  - *Needs two breakpoints, not one — ✅ done* (rules tier + per-bot tier + fast message anchor =
    3 of the 4 allowed).
  - *Do not mark one-shot calls cacheable — deliberately NOT followed.* The agent layer can't
    tell a night action from a discussion turn, so breakpoints are always on. This is usually
    right anyway: night/summary calls share the day's system-prompt prefix, so when they run
    within 5 min of discussion they READ the warm entry instead of paying full price. Worst case
    (cold one-shot, nothing follows in 5 min) is +25% on that call's input — small next to the
    10x saving on warm reads. Revisit only if real-game numbers say otherwise.
  - *Haiku caveat.* The rules block is ~3k tokens, under Haiku 4.5's 4096-token minimum cacheable
    prefix, so the first breakpoint silently no-ops on Haiku bots. Fine on Sonnet/Opus.
  - *Where it actually invalidates:* NOT during the night. `night-actions.ts:303` defers deaths to
    `startNewDay` (`:949`), and role knowledge is built there too, so the prompt is byte-stable
    from the start of the day through the end of the night. The churn is three back-to-back
    invalidations at the day boundary: vote resolution (`bot-actions.ts:952-986`), `startNewDay`,
    then each bot appending its own summary to `bot_context`.
- Resolve vote tie by asking Detective to choose
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities

## ✅ Done: full prompt-caching rollout — layout, breakpoints, affinity keys, accounting (2026-08-04)

Everything from the caching plan shipped in one push. Verified with 542 unit tests (incl. new
`cache-tiers.test.ts`) and the full live suite (`npm run test:live`).

- **Prompt layout** (`bot-prompts.ts`): `BOT_SYSTEM_PROMPT` reordered to [shared rules
  (placeholder-free)] → `CACHE_TIER_MARKER` → [identity, human-player section, Game State +
  `%bot_context%` last]. `AbstractAgent` splits the instruction on the marker
  (`instructionParts`); every provider's joined prompt now has a cross-bot shared prefix, which
  implicit caches (all 8 non-Anthropic providers) exploit automatically.
- **Anthropic breakpoints** (`anthropic-agent.ts`): one `cache_control` block per tier (shared
  rules = org-level entry any bot refreshes; per-bot tier = one entry per bot per day) plus the
  fast anchor on the second-to-last message via `applyCacheBreakpoint` — which, now that the
  reminder is detached, is exactly the current GM command block. 3 of 4 breakpoints used.
  Top-level auto-caching mode rejected on purpose: it marks the LAST block, which is our
  never-repeated throwaway tail. Live-verified: first calls write (`0 read, 9832 written`),
  repeats read (`4287 read, 248 written, 79 uncached`).
- **Reminder detached** (`bot-actions.ts`, 3 sites): `BOT_REMINDER_POSTFIX` now rides as its own
  trailing user message, never persisted. Default `AbstractAgent.prepareMessages` merges
  consecutive user messages back together (byte-identical to the old shape) for providers that
  expect alternating roles; `ClaudeAgent` overrides to keep them separate (the API combines
  consecutive user turns but keeps distinct content blocks).
- **Affinity keys**: `grok-agent` sends `x-grok-conv-id` (sha256 of bot name + instruction —
  stable within a day) so requests land on the server holding the cache; `mistral-agent` injects
  `prompt_cache_key` via the SDK's beforeRequest hook (SDK 1.10.0 has no typed field and strips
  unknown keys; hook falls back to the untouched request on any error).
- **Accounting**: Anthropic `buildTokenUsage` reads `cache_read/creation_input_tokens` and
  reconstructs full prompt size (its `input_tokens` EXCLUDES cached tokens, unlike everyone
  else); `gpt-5-agent` reads Responses-API `input_tokens_details.cached_tokens`;
  `extractTokenUsage` gained Kimi's third wire shape (top-level `usage.cached_tokens`);
  `extractMistralTokenUsage` probes `additionalProperties` for cache fields — and live runs
  prove Mistral DOES report `prompt_tokens_details.cached_tokens` there (Magistral: 8169/8175
  cached; other Mistral models report 0 so far — watch `MISTRAL_CACHE_CALIBRATION`). Deepseek/
  GLM/Grok/Google/Fugu were already wired. Grok cached price corrected $0.50 → $0.30/M;
  Mistral models got `cacheHitPrice` at the documented 10% of input. All `💾 Prompt cache:` log
  lines are the observability signal in BetterStack.
- Pre-existing live-test issues fixed alongside: gpt-5 cost test crossed Luna's 272K
  extended-context threshold (from the earlier repricing); grok cost test repinned to the
  corrected cached rate.

## ✅ Done: error-banner "Change model" is now a one-shot "Retry with different model" (2026-07-26)

The error banner's model button no longer permanently switches the failing bot's model (which was
unusable for hidden roles: you had to guess who holds the role, and a mid-game model change in the
players list leaked it). It now stores a one-shot `modelOverride` on the game doc
(`retryWithModelOverride` in `game-actions.ts`) and clears `errorState` in the same write; the
auto-processing effects re-run the failed action, which consumes the override
(`consumeModelOverride` — deleted from Firestore BEFORE the AI call, kept in memory) so it applies
to exactly one request. `getEffectiveModel` (`app/utils/bot-utils.ts`, tested) resolves the model at
every bot/GM agent-creation site (4 night processors, welcome/talk/vote, summaries, GM night
narration, GM bot selection). The server resolves WHO to retry from the persisted error context +
queue heads (`resolveRetryTarget`), so the client never needs to know which bot holds a hidden role;
the banner also hides the failing model name during NIGHT (a unique model would identify the role
holder). Permanent model changes are still available from the players list. Tier/usage rules are
enforced via the same `validateModelUsageForTier` as a permanent change.

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
