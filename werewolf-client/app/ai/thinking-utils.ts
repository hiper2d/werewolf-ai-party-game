/**
 * Defense against chain-of-thought leaking into visible chat messages.
 *
 * The OpenAI-compatible reasoning providers (DeepSeek, GLM, Kimi, Qwen,
 * MiniMax, Fugu) are all documented to return thinking in a separate field
 * (`reasoning_content` / `reasoning_details`), but models occasionally
 * misbehave and inline a `<think>…</think>` block into `message.content`
 * instead — observed live with qwen-plus (2026-08), and MiniMax documents it
 * as the default without `reasoning_split`. If that text reaches the lenient
 * JSON parser, its wrap-as-reply fallback can surface the ENTIRE chain of
 * thought — secret role included — as the bot's visible message.
 *
 * Every agent that reads `choices[0].message.content` must pass it through
 * here before parsing, and merge the returned `thinking` into its thinking
 * output so nothing is silently dropped.
 */
export function stripInlineThinking(raw: string): { text: string; thinking: string } {
    let thinking = "";
    let text = raw.replace(/<think>([\s\S]*?)<\/think>/g, (_, inner: string) => {
        thinking += (thinking ? "\n" : "") + inner.trim();
        return "";
    });

    // Orphan </think>: the opening tag (and usually most of the reasoning)
    // went to the provider's separate reasoning stream, but the tail — from
    // mid-thought up to the closing tag — bled into content. Everything before
    // the first orphan </think> is thinking; the reply follows it.
    const closeIdx = text.indexOf("</think>");
    if (closeIdx !== -1) {
        const before = text.slice(0, closeIdx).trim();
        if (before) thinking += (thinking ? "\n" : "") + before;
        text = text.slice(closeIdx + "</think>".length);
    }

    // Unterminated <think>: keep anything before it, and salvage a JSON object
    // that follows it (the model "recovered" mid-stream) — everything between
    // is thinking.
    const openIdx = text.indexOf("<think>");
    if (openIdx !== -1) {
        const after = text.slice(openIdx);
        const jsonStart = after.indexOf("{");
        thinking += (thinking ? "\n" : "") + (jsonStart === -1 ? after : after.slice(0, jsonStart)).replace("<think>", "").trim();
        text = text.slice(0, openIdx) + (jsonStart === -1 ? "" : after.slice(jsonStart));
    }

    return { text: text.trim(), thinking };
}

/** Joins provider-reported reasoning with any inline thinking salvaged from content. */
export function mergeThinking(...parts: Array<string | undefined | null>): string {
    return parts.filter(Boolean).join("\n");
}
