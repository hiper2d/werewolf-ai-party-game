// One-off: print a user's tier/balance/spending (no secrets).
import {db} from '../firebase/server';
(async () => {
    const email = process.argv[2];
    const snap = await db!.collection('users').doc(email).get();
    const u = snap.data() as any;
    const {apiKeys, stripeCustomerId, ...rest} = u ?? {};
    console.log(JSON.stringify({...rest, hasApiKeys: !!apiKeys, hasStripe: !!stripeCustomerId}, null, 2));
    const drafts = await db!.collection('avatarDrafts').get();
    console.log('drafts:', drafts.docs.map(d => { const x = d.data(); return {id: d.id, status: x.status, totalCostUSD: x.totalCostUSD, keys: x.keys?.length, version: x.version, error: x.error}; }));
    process.exit(0);
})();
