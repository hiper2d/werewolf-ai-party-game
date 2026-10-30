/**
 * Fold one device into another BY HAND, when we know two browsers are one person (the
 * `reqacc` ring, 2026-10-29: five accounts on a Murrieta browser, the sixth on a fresh
 * browser from a Los Angeles IP after the device-shared cap refused the others).
 *
 * What it does:
 *   1. `devices/{from}.aliasOf = to` — registerDevice follows it on the next page load, so the
 *      folded browser's cookie is rewritten to the canonical id (device-utils MANUAL LINKING).
 *   2. Merges the folded device's users and IPs into the canonical doc and appends a
 *      `manualLinks` entry (who, from where, when, why). Today's dailySpend is added when both
 *      docs are on the same period, so the shared budget is honest from this minute.
 *   3. Re-points every user seen on the folded device (plus any `--users a,b` given) to the
 *      canonical device: `lastDeviceId`, `knownDeviceIds`, `linkedVia: manual`. This is what
 *      the spend guard and the charge read, so the budget is shared BEFORE their next visit.
 *
 * Never chains: refuses when the canonical device is itself an alias. Reversible: delete
 * `aliasOf` on the folded doc and set the users' `lastDeviceId` back.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/link-devices.ts <fromDeviceId> <toDeviceId> [--users a@x,b@y] [--note "..."] [--dry-run]
 */
import {FieldValue} from 'firebase-admin/firestore';
import {db} from '../firebase/server';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; };
const DRY = args.includes('--dry-run');
const [from, to] = args.filter(a => !a.startsWith('--') && a !== flag('--users') && a !== flag('--note'));
const extraUsers = (flag('--users') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const note = flag('--note') ?? 'manual link';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uniq = (list: unknown, cap: number) => [...new Set((Array.isArray(list) ? list : []).filter(x => typeof x === 'string'))].slice(-cap) as string[];

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    if (!UUID_RE.test(from ?? '') || !UUID_RE.test(to ?? '')) throw new Error('usage: link-devices.ts <fromDeviceId> <toDeviceId> (both v4 UUIDs)');
    if (from === to) throw new Error('from and to are the same device');

    const [fromSnap, toSnap] = await Promise.all([db.collection('devices').doc(from).get(), db.collection('devices').doc(to).get()]);
    if (!fromSnap.exists) throw new Error(`device ${from} does not exist`);
    if (!toSnap.exists) throw new Error(`device ${to} does not exist`);
    const f = fromSnap.data() as any, t = toSnap.data() as any;
    if (t.aliasOf) throw new Error(`canonical device ${to} is itself an alias of ${t.aliasOf}; link to that one instead`);
    if (f.aliasOf && f.aliasOf !== to) throw new Error(`${from} is already an alias of ${f.aliasOf}`);

    const now = Date.now();
    const fromUsers = uniq(f.users, 20);
    const users = [...new Set([...fromUsers, ...extraUsers])];
    const mergedUsers = uniq([...(t.users ?? []), ...users], 20);
    const mergedIps = uniq([...(t.ips ?? []), ...(f.ips ?? [])], 10);

    // Today's budget: add the folded device's spend when it is on the same UTC day.
    let dailySpend = t.dailySpend;
    if (f.dailySpend && t.dailySpend && f.dailySpend.period === t.dailySpend.period) {
        const buckets: Record<string, number> = {...(t.dailySpend.buckets ?? {})};
        for (const [k, v] of Object.entries(f.dailySpend.buckets ?? {})) buckets[k] = (buckets[k] ?? 0) + Number(v);
        dailySpend = {...t.dailySpend, totalUSD: (t.dailySpend.totalUSD ?? 0) + (f.dailySpend.totalUSD ?? 0), buckets, limitHits: (t.dailySpend.limitHits ?? 0) + (f.dailySpend.limitHits ?? 0)};
    } else if (f.dailySpend && !t.dailySpend) {
        dailySpend = f.dailySpend;
    }

    console.log(`fold ${from} (${fromUsers.length} users, ${f.geo?.city ?? '?'}, ips ${(f.ips ?? []).join(',')})`);
    console.log(`into ${to} (${(t.users ?? []).length} users, ${t.geo?.city ?? '?'}, ips ${(t.ips ?? []).join(',')})`);
    console.log(`users re-pointed: ${users.join(', ')}`);
    console.log(`canonical after: users ${mergedUsers.length}, ips ${mergedIps.length}, dailySpend ${JSON.stringify(dailySpend ?? null)}`);
    if (DRY) { console.log('(dry run, nothing written)'); return; }

    const batch = db.batch();
    batch.set(db.collection('devices').doc(from), {aliasOf: to, aliasedAt: now, aliasNote: note}, {merge: true});
    batch.set(db.collection('devices').doc(to), {
        users: mergedUsers,
        ips: mergedIps,
        ...(dailySpend ? {dailySpend} : {}),
        manualLinks: FieldValue.arrayUnion({via: 'manual', from, users, ips: f.ips ?? [], city: f.geo?.city ?? null, at: now, note}),
    }, {merge: true});
    for (const email of users) {
        batch.set(db.collection('users').doc(email), {
            lastDeviceId: to,
            knownDeviceIds: FieldValue.arrayUnion(to, from),
            linkedVia: {via: 'manual', deviceId: to, from, at: now, note},
        }, {merge: true});
    }
    await batch.commit();
    console.log('done');
}

main().then(() => process.exit(0)).catch(error => { console.error(error.message ?? error); process.exit(1); });
