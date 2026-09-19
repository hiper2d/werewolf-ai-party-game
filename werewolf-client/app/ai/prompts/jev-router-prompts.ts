/**
 * Everything the Jev speaker router SAYS to the judge model, in one place: the state's game
 * line, the per-bot reply question with its score levels, the quiet-pool question and the
 * drama check. The routing LOGIC (thresholds, counts, fairness) lives in app/api/jev-router.ts.
 *
 * Jev reads instructions literally (no inference of intent, no arithmetic), so each level and
 * question names the concrete situations it covers. Wording changes here change every
 * recorded call's meaning — replay a few records (scripts/jev-replay.ts --ask) after editing.
 */

/** The `game` line of the state — the only framing the model gets. */
export const JEV_STATE_GAME_DAY =
    'Werewolf party game, day discussion phase: the players talk, then vote to eliminate a suspected werewolf.';
export const JEV_STATE_GAME_AFTER =
    'Werewolf party game, after-game discussion: the game is over and the players talk about how it went.';

/**
 * Ordered levels of the per-bot reply score, lowest first. The weighted score runs 0…3; the
 * LAST level is the "must reply now" one whose probability makes a bot a must-pick.
 */
export const JEV_REPLY_SCORE_LEVELS = [
    'not part of the current thread of the discussion',
    'mentioned in passing or only loosely connected to the current thread',
    'an active party to the current thread: arguing, accused, defending, or being discussed in the last few messages',
    'must reply now: directly asked a question, accused, insulted, or addressed by name in the latest message',
] as const;

/** One score question per alive bot. `%bot_name%` is the bot. */
export const JEV_REPLY_QUESTION =
    'How strongly should %bot_name% reply to the latest message of the discussion, given the current thread?';

/**
 * One choice over the quiet pool (the options ARE the pool — it is deliberately not listed in
 * the state, where it skewed the reply scores of uninvolved bots).
 */
export const JEV_QUIET_PICK_QUESTION =
    'The bots offered as options have said little or nothing today, and one of them will be pulled into the discussion next. ' +
    'Which of them does the current topic of the discussion concern the most — because they were mentioned, suspected, defended, ' +
    'or asked about, or because the topic is about something they said earlier?';

/** Gate for the mid-day illustration. */
export const JEV_DRAMATIC_QUESTION =
    'Do the latest two messages of the discussion contain a heated confrontation, a shocking accusation, or a confession, ' +
    'rather than ordinary suspicion trading or small talk?';
