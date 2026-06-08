# Bugs and improvements

- [DONE] Hide error messages and show a better instruction to the user of what to do with them (retry, update model, etc)
    - Error banner now shows a friendly "<bot>'s AI model call failed" message with **Retry** and
      **Change model** actions (the latter opens the model-selection dialog for the failing bot).
      Raw provider details moved behind a collapsible "Technical details" disclosure.
    - [NEW] We should hide technical details from UI. I should be able to get them from logs 
- [DONE] Fix the tooltip issue on roles buttons on mobile screen - add the ? icon for it
    - Role tooltips were hover-only (`onMouseEnter`/`onMouseLeave` on the whole pill), so they
      were unreachable on touch — and tapping the pill only toggled selection. Added a dedicated
      circular **?** icon next to each role pill (mirroring the play-style picker): hover on desktop,
      tap-to-toggle on mobile. Moved the hover handlers off the select button so select vs. info no
      longer conflict on touch. Added `aria-label` per role and `preventDefault` on the ? tap.
- [DONE] Remove copyrighted franchises (Harry Potter, LOTR, Star Wars, Hunger Games) from the
    new-game theme presets to avoid the app *promoting* protected IP. `RANDOM_THEMES` now seeds
    public-domain / neutral settings (Dracula, Sherlock Holmes, Cthulhu Mythos, Treasure Island,
    Spaceship Crew, Wild West Town); marketing copy on the landing/about pages no longer name-drops
    Harry Potter / Hogwarts. User-typed themes still generate real canonical characters on request
    (the story-gen prompt is unchanged) — that's an intentional selling point; only the app's own
    suggestions were neutralized.
- Footer on all pages?
- Bots should have better notion of day and night events ordering. Review the summary logic, it should have
    - Unified past days summary text
    - Past days voting results (who voted for whom, in what order; the reasons can be omitted)
    - Past nights results (who died and how, what else happened)
- Add game rules page. Add hints to roles on the game prev
- Resolve vote tie by asking Detective to choose
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities

## Provider structured-response parse failures kill games (recoverable but fatal in practice)

When a provider returns slightly-malformed or truncated JSON, `askWithZodSchema`
throws and the game is left with a persistent `errorState`. The game is marked
`recoverable: true`, but in practice the player has already bailed — the game
sits dead until the 30-day TTL sweeps it.

**Evidence** (from a Firestore scan of the live `games` collection, 2026-06-02):
**5 of 32 live games** were carrying such an error. Every one was a structured-
response parse failure, across multiple providers:

- DeepSeek — `Failed to parse JSON response: SyntaxError: Expected ',' or '}' ... at position 727` (JSON truncated mid-object)
- Grok — `Failed to parse JSON response: Unexpected token 'M', "Max, calli"... is not valid JSON` (model returned prose, not JSON)
- Mistral — `Response validation failed: [...]`
- OpenAI — `Zod field ... uses .optional() without .nullable()` (schema-definition bug, not the model)
- "Bot {\"Cato\":5} not found in game" — downstream of a malformed bot-selection response

**Where it bites:** 4 of the 5 died at `WELCOME` / early `DAY_DISCUSSION` — i.e.
on the **first** LLM call (bot welcome generation). The opening turn is the most
fragile. Concrete case: `star-wars-1780191192418` (GM `gpt-mini`) died at WELCOME
on a DeepSeek bot returning JSON truncated at position 727; player never got past
the intro.

**Suggested fixes:**
- Retry-on-parse-failure: on a Zod/JSON parse error, retry the call 1–2x
  (optionally with a "return ONLY valid JSON matching the schema" nudge) before
  writing `errorState`. Most of these look like one-off bad generations.
- More lenient/repair parse (e.g. extract the first balanced JSON object, strip
  prose preamble) before giving up — handles the "model wrapped JSON in chat" case.
- Fix the OpenAI Zod schema: `.optional()` fields that can be null must also be
  `.nullable()` (provider-side strict-schema requirement).
- The OpenAI/structured-output path should validate the *schema* at build time so
  the `.optional()`-without-`.nullable()` class can't ship.

**Observability gap:** ~~`errorState.context` records only `{gameId, timestamp,
function}` — not which **bot/model** made the failing call.~~ [DONE]
`withErrorHandling` now resolves the failing **bot/model/gameState** (from the
agent-thrown `BotResponseError.context`, falling back to the head of the game's
turn queue + a lookup of the bot's `aiType`) and writes `botName`, `model` and
`gameState` into `errorState.context`. It also emits a structured
`logger.error('Game action failed: <fn>', {gameId, function, botName, model,
gameState, apiProvider, recoverable, error, details})` to Better Stack, so
failures can be attributed per-model without grepping the stack trace.
(Consumed by Marlow's `monitor_health` broken-game watch, which can then alert
per-model.)