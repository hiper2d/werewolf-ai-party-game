/**
 * Display-time typography for model-written prose.
 *
 * Applied wherever a reply is SHOWN, never when it is stored or sent to TTS:
 * stored text stays exactly what the model said, old messages get the same
 * treatment as new ones, and the TTS cache keys on the raw text, so the chat
 * and the cinematic bubble keep sharing one audio request per line.
 */

/**
 * Models set em dashes "closed" (Chicago style: `tonight—static`), which
 * reads cramped in the chat. This opens them (`tonight — static`).
 */
export function spaceEmDashes(text: string): string {
    return text
        .replace(/(?<=\S)—/g, ' —')
        .replace(/—(?=\S)/g, '— ');
}

// Opening quote → the closing quotes that pair with it. Straight quotes close
// themselves; typographic ones have a dedicated closing glyph.
const QUOTE_PAIRS: Record<string, string[]> = {
    '"': ['"'],
    '“': ['”', '"'],
    "'": ["'"],
    '‘': ['’', "'"],
};

/**
 * Drops one pair of quotation marks wrapping the whole reply. The prompt's
 * examples are shown in quotes, and some models mirror that by quoting their
 * own line — `“Max, welcome to Slytherin…”` — which reads as reported speech
 * instead of the character talking. Only a pair that encloses everything is
 * removed: a reply that starts with a quote because it opens on dialogue
 * (`"Trust me," she said. Then she left.`) still has other quotes of the same
 * family inside and is left alone.
 */
export function unwrapQuotedReply(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length < 2) return text;
    const open = trimmed[0];
    const closers = QUOTE_PAIRS[open];
    if (!closers) return text;
    const last = trimmed[trimmed.length - 1];
    if (!closers.includes(last)) return text;
    const inner = trimmed.slice(1, -1);
    const family = new Set([open, ...closers]);
    for (const ch of inner) {
        if (family.has(ch)) return text;
    }
    return inner.trim();
}

/** Everything the chat and the cinematic bubble do to a reply before showing it. */
export function formatReplyForDisplay(text: string): string {
    return spaceEmDashes(unwrapQuotedReply(text));
}
