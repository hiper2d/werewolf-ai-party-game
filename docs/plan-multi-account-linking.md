# Plan: linking burner accounts across VPN + private window

Status: design agreed with Alex on 2026-10-29, nothing implemented. Written 2026-10-30.
"Decisions" is what Alex agreed in the conversation, "Design" is how the code would carry it,
"Open questions" is still Alex's call. Companion to the device-id work of 2026-09-13
(`app/api/device-actions.ts`, `app/utils/device-utils.ts`) and the free-tier caps
(`app/api/limits-actions.ts`, `docs/plan-user-spend-tracking-and-daily-cap.md`).

## Problem

The free tier is metered per account AND per browser (device id in an httpOnly cookie mirrored
to localStorage). A browser that arrives with no id inherits the device last seen from the same
public IP within 12 hours (IP linking). That is the whole defence today.

On 2026-10-26..29 one person ran six Gmail accounts, `reqaccv1` .. `reqaccv6`:

| when (UTC) | account | what happened |
|---|---|---|
| 10-26 08:30 | v1 | signs up, 5 games on day one, $4.93 |
| 10-26 22:23 | v2 | same browser (device `51b6060c…`, Murrieta CA); $12.83 over three days |
| 10-28 11:43 | v2 | refused: account day cap $5 reached |
| 10-28 12:57 / 13:02 | v3, v6 | clean private windows, same home IP → IP-linked to the device → refused by the device-shared cap at $0 |
| 10-28 19:58 | v4 | same again → linked → refused at $0 |
| 10-28 20:06 | v5 | **different network** (Los Angeles IP), fresh browser → nothing links it → plays a full five-day game, $2.43 |

The IP rule held everywhere it could see; the one step it cannot see is a network change. The
account handles alone would have told the story on day one. Total extracted: about $20 across the
ring over four days, of which $2.43 came through the hole. The money is small; the pattern is not,
and the September farmer did the same (four numbered accounts, 41% of a month's free spend).

## Decisions (Alex, 2026-10-29)

1. **Blocklist now.** A list of emails in `config/limits`; the free-tier guard refuses them. It
   stops the accounts that exist; it does not solve the problem and is not meant to.
2. **Fingerprint linking, second signal beside the IP rule.** Collect what a VPN + private window
   does NOT change and let a keyless browser inherit a device that matches. **The IP-derived city
   is NOT a gate** (a VPN moves it; it is the one signal guaranteed wrong). **The system timezone
   IS a signal** — the browser reports the clock's zone, not the network's, so a VPN leaves it
   alone while an IP city that disagrees with it is itself a VPN tell.
3. **Collect raw values, not only a hash**, and keep them on the device doc: the thresholds have
   to be set from data we do not have yet.
4. **Monitor first.** Two weeks of collection with NO linking, then a pairwise analysis against
   the ground truth we already have (the cookie device id), then enforcement at a threshold the
   analysis picks. Same path the content screen took (`jevScreenMode`).
5. **Sibling-handle linking, third signal.** Deterministic; no model (a prompt is a target and a
   call per signup is waste).
6. **Marlow pages Alex on every detected match**, in monitor mode too, so each one is read by
   hand and acted on fast.
7. **Day-one brake: 2 games on the first day, dollar caps unchanged.** The $5 day cap and $20
   month cap stay. A lower first-day dollar cap does not solve multi-accounting (the burner's
   yield is whatever the cap is; they make more accounts) and it hits the most engaged newcomers.
8. **Never refuse on a signal alone.** Fingerprint, IP and handle only decide WHICH existing
   device a keyless browser inherits; refusals still come from that device's own spend.

### Why not a lower first-day dollar cap — the numbers (accounts created 2026-09-30..10-29, excluding own + ring)

| | |
|---|---|
| new accounts | 165 |
| created a game on day one | 110 |
| exactly 1 game on day one / 2 / 3+ | 91 / 15 / 4 |
| day-one spend median / p90 / p95 / max | $0.37 / $1.88 / $2.54 / $5.07 |
| hit the $5 cap on day one | 1 |
| came back after day one | 5 |

A 2-game day-one cap touches 4 of 110 newcomers. A $3 day-one cap would have refused the 5 most
engaged newcomers mid-game on their best day. Retention is 5 of 110; nothing here may touch the
first game.

## Design

### 1. Blocklist

- `config/limits.blockedEmails: string[]` (lower-cased), read by `getFreeTierLimits()` next to the
  other live values (cache it the same way).
- Checked in `assertFreeSpendWithinLimit` (the hook before every LLM ask) and at the top of
  `previewGame` / `createGame`, so a blocked account cannot spend a token. Error class
  `AccountBlockedError` → the form / chat shows "This account can't start games. Contact us on
  Discord." (`GameActionResponse.rejected` on chat, the preview result union on the form — thrown
  errors lose their message in prod).
- Log `ACCOUNT_BLOCKED` at warn with the email hashed (Better Stack never carries the user);
  Marlow's digest counts them.
- No UI to edit; Alex edits the doc. Seed it with the six `reqacc` addresses.

### 2. Fingerprint collection (phase A — monitor)

Collected by the existing per-page-load device call (`registerDevice`), on the client, no
library:

| signal | source | expected drift | weight (prior) |
|---|---|---|---|
| canvas hash | draw text + shapes on an offscreen canvas, hash the pixels | changes with GPU driver / OS / browser major | 3 |
| WebGL renderer + vendor | `WEBGL_debug_renderer_info` (unmasked) | stable | 3 |
| screen w × h, devicePixelRatio, colorDepth | `screen.*`, `devicePixelRatio` | stable per machine; an external monitor changes it | 2 |
| OS + OS version | UA client hints high-entropy (`platform`, `platformVersion`), UA string fallback | changes on OS update | 1 |
| browser family + major version | UA client hints `brands` / UA string | changes every few weeks | 1 |
| timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | stable; travel | 1 (and a VETO, see below) |
| languages | `navigator.languages` | stable | 1 |
| CPU cores, device memory | `hardwareConcurrency`, `deviceMemory` (Chrome) | stable | 1 |
| touch points | `maxTouchPoints` | stable | 0 (recorded, not scored) |
| audio hash | OfflineAudioContext oscillator fingerprint | stable | 0 in phase A; weigh after the analysis |

Stored on `devices/{id}.fingerprints[]`: the raw values + a `hash` of the full vector +
`seenAt`, capped at the last 5 distinct vectors (a browser update must not erase the history we
match against). Also stored per sighting: `clockZone` (the timezone) and `geoCity`, so the
timezone/geo disagreement (a VPN tell) is visible on the doc and in Marlow's cluster lines.

Phase A does NOT link. For every keyless browser it still computes the best-scoring candidate
and writes the would-be link to the new collection `deviceLinks` with `mode: 'monitor'` (see §5),
so the match data accrues from day one.

Privacy page: add one line — a browser profile (screen, graphics, timezone, language, browser)
is stored to meter free use and link repeat sign-ups; no tracking across sites, no third parties.

### 3. The analysis (phase B — after ~two weeks, `scripts/fingerprint-analysis.ts`)

Ground truth is the cookie device id. Over all devices with a fingerprint:

- **Same device id, vectors differ** → drift: which signals changed on a real machine within the
  window. Sets the weights (a signal that drifts weekly cannot carry weight 3).
- **Different device ids, vectors match at threshold T** → either a wiped browser (what we want)
  or two people on identical hardware (the false positive). The honest pool is devices with ONE
  user, no cap refusals, no shared IP, no sibling handle. The collision rate inside the honest
  pool at each T is the false-positive rate of T. Print the table T = 7..13 × {strong signals
  required: none / one / both}.
- **Positive examples**: the `reqacc` devices (`51b6060c…` Murrieta, `62061235…` Los Angeles) are
  one machine. Their pairwise score is the calibration point, if the person keeps playing. Any
  pair already linked by the IP rule (`ipLinks`) is a positive example too.

Output: the threshold and the strong-signal rule, chosen where the honest pool has zero (or one)
collisions. Written back into this document before phase C.

### 4. Fingerprint linking (phase C — enforce)

Config `config/limits.fingerprintLinkMode: 'off' | 'monitor' | 'enforce'` (default `monitor`
once deployed; Alex flips it). In `registerDevice`, the keyless branch becomes:

1. IP rule as today (12 h, city agrees) → inherit.
2. Else fingerprint rule: candidates = devices seen in the last **72 h** (no geography filter);
   **veto** any candidate whose timezone differs; score the rest; inherit the best when
   `score ≥ T` and the strong-signal rule holds (prior: `T = 10` of 13 with BOTH canvas hash and
   GPU equal — **to be set by phase B**); tie → most recently seen.
3. Else sibling-handle rule (§6) when a signed-in email is known at this point; otherwise the
   rule runs at sign-in (`createOrUpdateUser`) and re-points the user's device.
4. Else mint a new id.

Every inheritance writes a `deviceLinks` row and logs `DEVICE_LINKED_BY_FINGERPRINT` (device ids,
score, matched signals — never the user) like `DEVICE_LINKED_BY_IP`. The user doc gets
`linkedVia: 'fingerprint'`.

Residual weakness, accepted: identical hardware + same OS and browser version + same timezone,
within 72 h (two MacBook Airs of one model in one city). The knob is the window, then T. Brave and
Safari flatten several signals; a ring on Brave + VPN still gets through — the day-one brake and
the platform-wide cap bound what that is worth.

### 5. `deviceLinks` collection + Marlow alert

One flat row per detected match (both modes), 180-day `expireAt`, like the Jev records:

```
{ at, mode: 'monitor'|'enforce', rule: 'ip'|'fingerprint'|'handle',
  newDeviceId, linkedDeviceId, score, matched: ['canvas','gpu','screen',…], vetoed: false,
  newUser?, linkedUsers: [...], newIp, linkedIps: [...], clockZone, geoCity, zoneGeoMismatch: bool,
  linkedDeviceSpendTodayUSD, linkedDeviceLimitHits }
```

Marlow: new task `monitor_devices` in `~/projects/marlow/projects/werewolf-ops/tasks/`, **hourly**
(the Firestore read is a few rows; the existing watches run every 3–6 h, too slow for "react
fast"). Handler `handlers/monitor_devices.py`: rows since the last tick → one
`notify_alex(urgency="urgent")` per new match with the pair (rule, score, matched signals, the
users on both devices, both IPs and cities, the zone/geo mismatch flag, the linked device's spend
today and cap hits, links to the user docs), plus a digest line with the day's counts per rule
and mode. State = last seen `at`. `werewolf_stats.py` gets a "device links" line (per rule, per
mode, how many went on to hit a cap) next to the cluster lines.

### 6. Sibling-handle linking

Deterministic, at sign-in. Normalize: lower-case local part; for Gmail drop dots and the `+tag`.
`stem = local part with trailing digits removed`. A new account is a **sibling** of an account
created in the last **7 days** when both stems are equal, `len(stem) ≥ 5`, and the trailing
digits differ (`reqaccv5` ~ `reqaccv4`: stem `reqaccv`; `john12` vs `john7` is not flagged — stem
too short). The sibling inherits the older account's device (its budget), row in `deviceLinks`
with `rule: 'handle'`, log `DEVICE_LINKED_BY_HANDLE`. Needs a `users` query by `handleStem` →
store `handleStem` + `created_at` on the user doc at creation (backfill the last 30 days with a
script). Monitor/enforce follows `fingerprintLinkMode` (one switch for both new rules).

### 7. Day-one brake

`config/limits.firstDayGames` (default 2). In the games-per-day check in `createGame`: when
`users.created_at` is less than 24 h old, the limit is `min(gamesPerDay, firstDayGames)`. Message
names the real reason ("New accounts can start 2 games on their first day"). The check counts
stored games, and players delete games — the `reqacc` person did; acceptable for a brake, the
spend cap is the meter.

## Phases

| phase | what ships | gate |
|---|---|---|
| A (first) | §1 blocklist (seeded), §2 collection + `deviceLinks` in monitor mode, §5 Marlow hourly alert, §7 day-one brake, privacy line | Alex review; prod deploy |
| B (~2 weeks later) | §3 analysis script, threshold + weights written here | the honest-pool collision table |
| C | §4 enforce + §6 sibling rule, `fingerprintLinkMode: 'enforce'` | Alex flips the switch after reading B |

## Open questions

1. **Hourly Marlow alerts in monitor mode** will page on every would-be link, including false
   ones — that is the point for two weeks; decide after B whether `monitor` rows still page or
   go to the digest only.
2. **Blocklist scope**: emails only, or also device ids (blocks the browser whatever the account)?
   Device blocks would have stopped v1..v4, v6 at once but not v5.
3. **Linked-but-honest recovery**: a newcomer wrongly linked to a stranger's spent device sees a
   cap refusal they did not earn. Today's refusal message points at the profile/Upgrade. Do we
   want a "think this is a mistake? Discord" line, or is the 72 h window enough?
4. **Backfill**: the Murrieta / Los Angeles devices are the one known positive pair; they only
   calibrate if the person comes back. Fine either way — note it in B's output.
