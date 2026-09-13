/**
 * Pure helpers for the device identity record. Kept out of device-actions.ts because a
 * `'use server'` module may only export async functions, and these need to be testable
 * without a request scope.
 */

/** Dedupe `value` to the end of `list` and keep only the newest `cap` entries. */
export function appendCapped(list: unknown, value: string, cap: number): string[] {
    const current = Array.isArray(list) ? (list.filter(v => typeof v === 'string') as string[]) : [];
    const without = current.filter(v => v !== value);
    return [...without, value].slice(-Math.max(1, cap));
}
