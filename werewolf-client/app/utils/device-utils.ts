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

/**
 * A device seen from an IP: what `ips/{ip}.devices` holds. `city` is the edge's coarse geo
 * at the time, when it had one.
 */
export interface IpDeviceSighting {
    deviceId: string;
    at: number; // epoch ms
    city?: string;
}

/**
 * How long after a device was seen from an IP a NEW browser on that IP is taken to be the
 * same person. Twelve hours covers "hit the cap, cleared the browser, made a new account"
 * with room to spare, and is short enough that an office or café network does not keep
 * merging strangers for days. Not configurable on purpose: it only matters when the id
 * is missing, which is rare for real players.
 */
export const IP_LINK_WINDOW_MS = 12 * 60 * 60 * 1000;

function isSighting(value: unknown): value is IpDeviceSighting {
    return typeof value === 'object' && value !== null
        && typeof (value as any).deviceId === 'string'
        && typeof (value as any).at === 'number';
}

/**
 * The device a browser with no id of its own should adopt, given what this IP has been seen
 * with: the most recent sighting inside the window whose city agrees with the request's
 * (a missing city on either side is not a mismatch — the edge does not always resolve
 * one). Undefined means "nothing recent enough here, mint a fresh id".
 */
export function pickLinkedDevice(
    sightings: unknown,
    now: number,
    city: string | undefined,
    windowMs: number = IP_LINK_WINDOW_MS
): IpDeviceSighting | undefined {
    const list = Array.isArray(sightings) ? sightings.filter(isSighting) : [];
    return list
        .filter(s => now - s.at >= 0 && now - s.at <= windowMs)
        .filter(s => !city || !s.city || s.city === city)
        .sort((a, b) => b.at - a.at)[0];
}

/** Like appendCapped for sightings: one entry per device, newest last, newest `cap` kept. */
export function appendSighting(list: unknown, sighting: IpDeviceSighting, cap: number): IpDeviceSighting[] {
    const current = Array.isArray(list) ? list.filter(isSighting) : [];
    const without = current.filter(s => s.deviceId !== sighting.deviceId);
    return [...without, sighting].slice(-Math.max(1, cap));
}
