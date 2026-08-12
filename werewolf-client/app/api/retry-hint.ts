/**
 * Model-facing explanations of why a bot's answer was rejected.
 *
 * These are built at the throw site, where the facts are still live (what was chosen, what was
 * legal, whose turn it was), and stored on the error as `explanation`. When the user presses
 * **Retry**, that stored string is appended verbatim to the rebuilt prompt — no reconstruction
 * from persisted context, and nothing here inspects game state.
 *
 * This is NOT an automatic retry: nothing calls a model. The failure surfaces in the UI as usual;
 * only a user's Retry click uses the explanation. "Retry with different model" ignores it — a
 * different model has not made the mistake being described.
 *
 * Kept in one module so the wording stays consistent across the five paths that can reject an
 * answer, and so it can be unit tested without Firestore.
 */

const CHOOSE_ONE = (targets: string[]) =>
    `Answer again and choose EXACTLY ONE name from this list, copied character for character: `
    + `${targets.join(', ')}`;

const PREFIX = '**Your previous answer was rejected.**';

/**
 * The bot named itself where that isn't allowed.
 *
 * Callers must only use this when self-selection is genuinely illegal for that role — the doctor
 * may heal themselves, so the doctor path uses `repeatTarget` instead when a self-heal is refused
 * for being two nights running.
 */
export function selfSelectionExplanation(action: string, targets: string[]): string {
    return `${PREFIX} You chose yourself, and you are not allowed to ${action} yourself. `
        + CHOOSE_ONE(targets);
}

/** The name isn't on the list at all — dead, unavailable this turn, or misspelled. */
export function invalidTargetExplanation(chosen: string, targets: string[]): string {
    return `${PREFIX} You chose "${chosen}", which is not one of the allowed options — that player `
        + `may be dead, unavailable this turn, or the name may be misspelled. ` + CHOOSE_ONE(targets);
}

/** Doctor/maniac chose the same player they chose last night. */
export function repeatTargetExplanation(chosen: string, targets: string[]): string {
    return `${PREFIX} You chose ${chosen}, whom you already chose last night, and you cannot choose `
        + `the same player two nights in a row. ` + CHOOSE_ONE(targets);
}

/**
 * The reply could not be parsed into the required schema. No target list here — the failure was
 * the response format, not the choice.
 */
export function invalidJsonExplanation(): string {
    return `${PREFIX} It was not valid JSON matching the required schema. Reply with ONLY the JSON `
        + `object — no prose before or after it, no markdown code fences, and no trailing commentary.`;
}

/**
 * True when an agent-layer failure was a parse/validation problem rather than a transport one, so
 * the JSON explanation applies. Matches the messages thrown by `json-response-parser.ts`.
 */
export function isResponseFormatFailure(details: string | undefined | null): boolean {
    if (!details) {
        return false;
    }
    return /Failed to parse JSON response|Response validation failed|validation failed/i.test(details);
}
