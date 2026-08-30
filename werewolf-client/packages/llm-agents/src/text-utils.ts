/** Strips a wrapping markdown code fence (```json … ``` or ``` … ```) from a model response. */
export function cleanResponse(response: string): string {
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
    } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
    }

    if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
    }

    return cleanResponse.trim();
}

/**
 * Stable non-cryptographic hex hash (FNV-1a, 64-bit as two 32-bit lanes).
 * For derived identifiers — provider cache keys, conversation routing ids —
 * where the only requirement is determinism. Pure JS on purpose: node:crypto
 * would drag a node builtin into browser bundles of this library (the werewolf
 * design kit bundles the catalog, and esbuild must resolve every import in the
 * graph even for code that later tree-shakes away).
 */
export function stableHashHex(input: string): string {
    let h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
    for (let i = 0; i < input.length; i++) {
        const c = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ c, 0x01000197) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
