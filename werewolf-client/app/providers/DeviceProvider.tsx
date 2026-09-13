'use client';

import {useEffect} from 'react';
import {useSession} from 'next-auth/react';
import {registerDevice} from '@/app/api/device-actions';

/**
 * Mirrors this browser's device id between localStorage and the server-owned httpOnly
 * cookie, once per page load. See device-actions.ts for why the id lives in two stores.
 *
 * The flow: send whatever localStorage has (possibly nothing), let the server decide the
 * canonical id (cookie wins, else adopt ours, else mint), write the answer back. So a
 * cleared cookie is restored from localStorage and cleared localStorage is restored from
 * the cookie, and only losing both at once mints a new identity.
 *
 * Renders nothing and never blocks. Every storage access is wrapped because Safari
 * private mode throws on localStorage rather than returning null, and a device id is
 * always optional - the per-account and platform caps hold on their own.
 */

const DEVICE_KEY = 'ww_device_id';

function readLocal(): string | undefined {
    try {
        return window.localStorage.getItem(DEVICE_KEY) || undefined;
    } catch {
        return undefined;
    }
}

function writeLocal(id: string): void {
    try {
        window.localStorage.setItem(DEVICE_KEY, id);
    } catch {
        /* private mode: the cookie alone carries the id */
    }
}

export default function DeviceProvider() {
    const {data: session} = useSession();
    const email = session?.user?.email ?? undefined;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const canonical = await registerDevice(readLocal(), email);
                if (!cancelled && canonical) {
                    writeLocal(canonical);
                }
            } catch {
                /* identity is best effort; never surface this to the player */
            }
        })();
        return () => {
            cancelled = true;
        };
        // Re-runs when the signed-in account changes, which is exactly the event that
        // links another email to this browser in the devices record.
    }, [email]);

    return null;
}
