/**
 * Free credits by hand (app/utils/credits.ts, app/api/credits.ts).
 *
 *   npx tsx --env-file=.env scripts/credits.ts show <email>
 *       The account's credits, how its sign-up credit was decided, its Discord claim.
 *
 *   npx tsx --env-file=.env scripts/credits.ts grant <email> <usd> [--note "why"]
 *       Add credits (a negative amount takes them away, never below zero). Decides the
 *       account's sign-up credit first if it is still open. Writes a `creditEvents` row.
 *       This is the way to put right an account that was denied by mistake.
 *
 *   npx tsx --env-file=.env scripts/credits.ts events [--days 7]
 *       The grants, denials, flags and Discord claims of the last days, newest first.
 *
 *   npx tsx --env-file=.env scripts/credits.ts backfill-stems [--write]
 *       Store `handleStem` on accounts created in the last 60 days that have none, so the
 *       sibling-name rule sees accounts from before credits. Prints what it would write;
 *       `--write` writes. Adds one field to those user docs and changes nothing else.
 */
import {db} from '../firebase/server';
import {addCredits, CREDIT_EVENTS_COLLECTION} from '../app/api/credits';
import {handleStem} from '../app/utils/credits';
import {isGuestEmail} from '../app/utils/guest';

function flag(name: string): string | undefined {
    const at = process.argv.indexOf(name);
    return at >= 0 ? process.argv[at + 1] : undefined;
}

function millis(value: any): number {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    return typeof value.toMillis === 'function' ? value.toMillis() : 0;
}

async function show(email: string) {
    const snap = await db!.collection('users').doc(email).get();
    if (!snap.exists) {
        console.log(`No account ${email}`);
        return;
    }
    const u = snap.data() as any;
    console.log(JSON.stringify({
        email,
        tier: u.tier,
        balance: u.balance ?? 0,
        credits: u.credits ?? '(not decided yet)',
        signupCreditStatus: u.signupCreditStatus ?? '(account from before credits)',
        signupCreditInfo: u.signupCreditInfo ?? null,
        discordCredit: u.discordCredit ?? null,
        discordClaimCode: u.discordClaimCode ?? null,
        handleStem: u.handleStem ?? null,
        lastDeviceId: u.lastDeviceId ?? null,
        claimedGuests: u.claimedGuests ?? [],
        created: millis(u.created_at) ? new Date(millis(u.created_at)).toISOString() : null,
    }, null, 2));
}

async function events(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const snap = await db!.collection(CREDIT_EVENTS_COLLECTION).where('createdAt', '>=', since).get();
    const rows = snap.docs.map(d => d.data() as any).sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
    console.log(`${rows.length} credit event(s) in the last ${days} day(s):`, counts);
    for (const row of rows) {
        const at = new Date(millis(row.createdAt)).toISOString().slice(0, 16).replace('T', ' ');
        const why = row.rules?.length ? ` rules=${row.rules.join('+')} linked=${(row.linked ?? []).join(',')}` : '';
        const discord = row.discordUsername ? ` discord=${row.discordUsername}` : '';
        console.log(`${at}  ${String(row.kind).padEnd(14)} ${String(row.amountUSD).padStart(6)}  ${row.email}  [${row.env}]${why}${discord}${row.note ? ` (${row.note})` : ''}`);
    }
}

async function backfillStems(write: boolean) {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const snap = await db!.collection('users').where('created_at', '>=', since).get();
    let found = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        const stem = handleStem(doc.id);
        if (!stem || data.handleStem || data.guest === true || isGuestEmail(doc.id)) continue;
        found++;
        console.log(`${write ? 'write' : 'would write'}  ${doc.id}  handleStem=${stem}`);
        if (write) await doc.ref.set({handleStem: stem}, {merge: true});
    }
    console.log(`${found} account(s) of ${snap.size} created in the last 60 days ${write ? 'updated' : 'would be updated (pass --write)'}.`);
}

(async () => {
    const [command, email, amount] = process.argv.slice(2);
    if (!db) throw new Error('Firestore is not initialized (run with --env-file=.env)');
    if (command === 'show' && email) {
        await show(email);
    } else if (command === 'grant' && email && amount !== undefined && Number.isFinite(Number(amount))) {
        const after = await addCredits(email, Number(amount), 'admin', {note: flag('--note')});
        console.log(`${email}: ${Number(amount) >= 0 ? '+' : ''}${Number(amount)} → $${after} of credits`);
    } else if (command === 'events') {
        await events(Number(flag('--days')) || 7);
    } else if (command === 'backfill-stems') {
        await backfillStems(process.argv.includes('--write'));
    } else {
        console.log('Usage: credits.ts show <email> | grant <email> <usd> [--note "…"] | events [--days 7] | backfill-stems [--write]');
        process.exit(1);
    }
    process.exit(0);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
