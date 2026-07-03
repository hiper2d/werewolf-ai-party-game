import { db } from "../firebase/server";

/**
 * Quick daily stats: games created and users active in a UTC window.
 * Usage: npx tsx --env-file=.env scripts/stats-today.ts [hoursBack=24]
 */
async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const hoursBack = Number(process.argv[2] || 24);
    const sinceMs = Date.now() - hoursBack * 3600 * 1000;

    // Games created in window (createdAt may be epoch ms or Firestore Timestamp)
    const snap = await db.collection('games').orderBy('createdAt', 'desc').limit(500).get();
    const toMs = (v: any) => (v && typeof v.toMillis === 'function') ? v.toMillis() : Number(v);
    const recent = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(g => toMs(g.createdAt) >= sinceMs);

    const owners = new Set<string>();
    const byState: Record<string, number> = {};
    const byTier: Record<string, number> = {};
    let errored = 0;
    for (const g of recent) {
        if (g.ownerEmail) owners.add(g.ownerEmail);
        const st = g.gameState || 'unknown';
        byState[st] = (byState[st] || 0) + 1;
        const tier = g.createdWithTier || 'unknown';
        byTier[tier] = (byTier[tier] || 0) + 1;
        if (g.errorState) errored++;
    }

    console.log(`\n=== Werewolf stats — last ${hoursBack}h (UTC) ===`);
    console.log(`Games created:   ${recent.length}`);
    console.log(`Distinct owners: ${owners.size}`);
    console.log(`With errorState: ${errored}`);
    console.log(`By state:`, byState);
    console.log(`By tier: `, byTier);
    console.log(`\nGames:`);
    for (const g of recent) {
        const when = new Date(toMs(g.createdAt)).toISOString();
        console.log(`  ${when}  ${g.gameState || '?'}  tier=${g.createdWithTier || '?'}  err=${g.errorState ? 'YES' : '-'}  ${g.id}`);
    }
}

main().catch(console.error);
