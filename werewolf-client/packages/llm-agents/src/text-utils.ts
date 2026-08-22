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
