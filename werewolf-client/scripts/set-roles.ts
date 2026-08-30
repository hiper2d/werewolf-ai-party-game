import { db } from "../firebase/server";

/** Reassign bot roles on one game. Usage: set-roles.ts <gameId> Name=role,Name=role */
(async () => {
    const [gameId, spec] = process.argv.slice(2);
    if (!db) throw new Error('Firestore is not initialized');
    const want = new Map(spec.split(',').map(p => {
        const [n, r] = p.split('='); return [n.trim(), r.trim()];
    }));
    const ref = db.collection('games').doc(gameId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Game ${gameId} not found`);
    const game: any = snap.data();
    const bots = (game.bots || []).map((b: any) =>
        want.has(b.name) ? { ...b, role: want.get(b.name) } : b);
    const unknown = [...want.keys()].filter(n => !bots.some((b: any) => b.name === n));
    if (unknown.length) throw new Error(`No such bots: ${unknown.join(', ')}`);
    await ref.update({ bots });
    console.log('roles now:');
    bots.forEach((b: any) => console.log(`  ${b.name.padEnd(6)} ${b.role}`));
})();
