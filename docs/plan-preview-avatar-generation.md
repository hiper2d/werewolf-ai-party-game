# Plan: Paid-tier avatar generation in game preview (+ in-game regenerate with feedback)

> Status: **planned, not implemented** (drafted 2026-08-23). All paths below are relative to `werewolf-client/`.

## Context

Today themed avatars generate automatically after `createGame` — the player never sees them before the game starts and cannot reroll a set they dislike. This feature lets **paid-tier** users generate portraits already on the new-game preview page (after characters are generated), view them, and **regenerate with optional feedback text** that is injected into the image prompt — each run billed to their balance (raw cost + 15% markup, same as everything else). Free-tier users see the button **disabled with a "paid feature" hint** (free games still get avatars after creation, unchanged). Also in scope: a paid-only **"Regenerate portraits"** action inside a running game (the `GamePage.tsx:108` comment already anticipates it), with the same feedback input. Scene images (welcome + night) come out of the same run and are shown in the preview too.

Key existing pieces to reuse: the whole grid→slice→verify pipeline and its billing block in `app/utils/avatar-generation.ts`; `sanitizePlayerName` (`app/utils/name-utils.ts:21`); the paid balance>0 precheck pattern (`app/api/game-actions.ts:180-187`); the subcollection-delete pattern (`removeGameById`, `game-actions.ts:122-124`); the 400-ops batch-chunk pattern (`game-actions.ts:671`); `userTier` already fetched client-side on the newgame page via `GET /api/user-tier`.

## Design decisions (settled)

- **Draft storage**: new collection `avatarDrafts/{draftId}` with `avatars/{key}` subcollection (same doc shape `{data, mime, createdAt}` + `expireAt`). **Singleton draft per user** — draftId derived from owner email (base64url) — so two open tabs contend on one doc and the claim transaction prevents double-charging.
- **Billing**: charged once, at draft-generation time. `createGame` copy only transfers bookkeeping (`totalGameCost`, `totalImagesCost`), never bills again.
- **Staleness**: avatar doc keys are sanitized names. Server-side authority: at createGame, draft key set must exactly match `{sanitize(humanName)} ∪ {sanitize(bot.name)…} ∪ {game-master}` (+ scene keys) — mismatch → ignore draft, fall back to `'pending'` flow. Client-side: mark portraits stale when **any** name changes (bots *and* the human name field) and clear draft state on "Regenerate Preview".
- **Feedback**: capped ~300 chars, control chars/newline-runs stripped, injected as `"Optional art direction from the player (style guidance only): …"` — in `buildPrompt` between the cell list and the final no-text paragraph; in `buildScenePrompt` before the trailing `No text anywhere in the image.` line (the no-text instruction must stay last).
- **Mid-regeneration UI**: status flips ready→generating → `getAvatarUrl` falls back to preset sketches, scene bubbles hide, the "Images are loading" chip reappears — all existing behavior, acceptable, no code changes needed there. Note: mid-game illustrations use the welcome scene + portraits as style references, so illustrations made after a regenerate follow the new style while older ones keep the old — acceptable, worth a code comment.

## Implementation steps

### 1. `app/utils/avatar-generation.ts` — extract pure core
- New `AvatarSpec` type: `{theme, description, humanPlayerName, bots: {name, gender, story}[]}` (names pre-sanitized by callers).
- Extract `generateAvatarSet(spec, apiKey, opts: {feedback?: string, logContext: object})` → `{slices, sceneWelcome?, sceneNight?, costUSD}`: buildCells/filler/grid/3-attempt verify loop + scene pair slicing (current lines 279–371), **no Firestore inside**.
- `capFeedback(text)` helper + feedback injection into `buildPrompt`/`buildScenePrompt` as above.
- `runAvatarGeneration(gameId, email, opts?: {allowReady?: boolean, feedback?: string})` keeps claim/storage/billing, calls the core; the claim transaction accepts `'ready'` only when `allowReady`.
- Extend `AvatarGenerationResult` with `avatarsVersion` (the client needs it for `?v=` cache-busting after regenerate — the avatar route serves `Cache-Control: private, max-age=86400, immutable`).

### 2. `app/api/game-models.ts`
- `AvatarDraft` interface: `{ownerEmail, status: 'generating'|'ready'|'failed', version, totalCostUSD, expireAt, lastFeedback?, keys: string[]}`.
- `avatarDraftId?: string` on `GamePreviewWithGeneratedBots` (flows through `createGame(gameData)` verbatim; createGame destructures explicitly so it's never persisted accidentally).

### 3. `app/api/avatar-draft-actions.ts` (new, `'use server'`)
- `generateDraftAvatars(spec, feedback?)`: auth → tier must be PAID (throw) → `getUserBalance() > 0` (throw with the existing "Insufficient balance…" wording) → validate/sanitize spec server-side (`sanitizePlayerName` per name, reject empty; cap theme/description lengths; `bots.length ≤ 12`) → transaction create-or-claim singleton draft (bail returning current `{draftId, status, version}` if already `'generating'` — not an error) → `generateAvatarSet` → chunked batch (~10 docs/batch): overwrite avatar docs, **delete keys absent from the new cast** (renamed bots), set draft `{status:'ready', version: Date.now(), totalCostUSD: increment, expireAt: +24h, lastFeedback, keys}`, `expireAt` on every subcollection doc too → `deductBalance(cost*1.15)` + `updateUserMonthlySpending`. On error: status `'failed'`, no billing.
- `getAvatarDraftStatus()`: returns own draft `{draftId, status, version}` (lets a bailed second tab poll to ready).

### 4. `app/api/avatar-drafts/[id]/avatars/[key]/route.ts` (new)
- Mirror the games avatar route, but check `draft.ownerEmail === session.user.email` only (no `ensureUserCanAccessGame` — it reads `games/{id}` and enforces tier match; deliberately no tier match here so a downgraded user can still view what they paid for). Same response headers.

### 5. `app/api/game-actions.ts` — `createGame`
- After sanitizing names, before the game `set()` (line ~595): if `avatarDraftId` present → load draft; verify owner + `'ready'` + exact key-set match → copy avatar docs into `games/{id}/avatars` (chunked, strip `expireAt`) **before** the game doc write (orphan subcollection docs are legal in Firestore), then include in the initial game object: `avatarsStatus: 'ready'`, `avatarsVersion`, `totalGameCost: previewCost + draft.totalCostUSD`, `totalImagesCost: draft.totalCostUSD`.
- The existing `after(() => runAvatarGeneration(...))` kickoff (lines 611–623) self-neutralizes on `'ready'` (the claim only takes pending|failed), but skip it explicitly when the draft was used. Schedule draft deletion (docs + parent, `removeGameById` pattern) in the same `after()`.
- Any mismatch/failed copy → log, proceed with `avatarsStatus: 'pending'` exactly as today.

### 6. `app/api/avatar-actions.ts` — in-game regenerate
- `regenerateGameAvatars(gameId, feedback?)`: auth → PAID + balance>0 precheck **before** the claim (regenerate must never hit the free-tier monthly-spending billing branch) → `runAvatarGeneration(gameId, email, {allowReady: true, feedback})` → return result incl. `avatarsVersion`.

### 7. `app/games/newgame/page.tsx` — preview UI
- New portraits row after preview renders: **"Generate portraits (~$0.25)"** button — paid: enabled; free: disabled (`opacity-50 cursor-not-allowed`) + hint text "Portrait preview is a paid feature — free games still get portraits when the game starts". Gate on `isTierLoaded` to avoid flashing the hint at paid users while the tier fetch resolves.
- Handler awaits `generateDraftAvatars` (same long-running server-action pattern as `generateGameAvatars`, proven in prod); on bail-as-generating, poll `getAvatarDraftStatus` every 3s.
- On ready: the identity capsules (lines ~911–916) show `<img src="/api/avatar-drafts/{id}/avatars/{key}?v={version}">` instead of the gradient initial; clickable → small modal (512px portrait + name + story, CharacterCard-style); GM portrait on the GM card; scene pair thumbnails under the Game Story field.
- Feedback textarea + "Regenerate" button appear once a set exists. Staleness: any name edit (bots or human) or "Regenerate Preview" → clear/flag draft state ("portraits out of date — regenerate", and warn that mismatched names discard portraits at create).
- Replace the page's inline duplicate sanitize logic with a `sanitizePlayerName` import (minor cleanup); pass `avatarDraftId` inside `gameData` on create.

### 8. `app/games/[id]/GamePage.tsx` — in-game entry
- "Regenerate portraits" compact button in the Participants header row next to the `$` toggle (lines ~1096–1106, match its style), visible to the paid owner only; opens a small confirm popover with feedback input + approx cost.
- Handler: `const r = await regenerateGameAvatars(id, feedback)` → apply returned `{avatarsStatus, avatarsVersion}` to state directly. This sidesteps the mount-effect guard (`avatarGenerationRef` is never reset — it would never re-poll a regeneration) and the returned `avatarsVersion` fixes the stale-`?v=` browser cache.

### 9. Manual console step (not code)
- Firestore TTL policies on `expireAt` for the `avatarDrafts` collection and its `avatars` subcollection group.

## Tests

- **`avatar-draft-actions.test.ts`** (mirror `game-actions.tier-enforcement.test.ts` mocking style): free tier rejected; paid with balance ≤ 0 rejected; concurrent claim bails without billing; failure path sets `'failed'` and never calls `deductBalance`; success bills once at `cost*1.15`.
- **createGame draft-copy**: valid draft → `avatarsStatus:'ready'` + summed cost fields; renamed bot / renamed human → `'pending'`, no copy; non-owner/non-ready draft ignored.
- **avatar-generation unit tests**: feedback capping/stripping; feedback lands before the trailing no-text paragraph in both prompts; key-set builder matches `sanitizePlayerName` output.
- **regenerate action**: free tier rejected; ready→generating claim works; second concurrent call no-ops.

## Verification (end-to-end)

- `npm run test`, `npx tsc --noEmit`, `npm run lint`.
- Browser (localhost:3000): paid-user newgame flow — generate, click a portrait modal, type feedback + regenerate (new `?v=`), rename a bot → stale warning, create game → portraits present immediately in chat/cinematic with no "Images are loading" chip; free user → disabled button + hint; in-game regenerate → preset fallback during generation, then the new set.
- Two-tab test: start generation in tab A, click in tab B → B bails and polls to ready, only one charge on the balance (profile balance delta ≈ cost × 1.15).
