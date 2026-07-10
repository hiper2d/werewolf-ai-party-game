import { db } from '../firebase/server';

async function main() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

  const hoursBack = 24;
  const cutoff = Date.now() - hoursBack * 3600 * 1000;

  const recent = await db.collection('games')
    .where('createdAt', '>', cutoff)
    .get();

  const owners = new Set<string>();
  recent.docs.forEach(d => {
    const o = d.data().ownerEmail;
    if (o) owners.add(o);
  });

  console.log(`Owners active in last ${hoursBack}h: ${owners.size}\n`);

  for (const email of owners) {
    const userDoc = await db.collection('users').doc(email).get();
    const u = userDoc.exists ? userDoc.data()! : null;

    const firstGameSnap = await db.collection('games')
      .where('ownerEmail', '==', email)
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();
    const totalSnap = await db.collection('games')
      .where('ownerEmail', '==', email)
      .count()
      .get();

    const firstGame = firstGameSnap.docs[0]?.data();
    const firstAt = firstGame ? new Date(firstGame.createdAt).toISOString() : 'n/a';
    const isNew = firstGame && firstGame.createdAt > cutoff;
    const masked = email.replace(/^(..).*(@.*)$/, '$1***$2');

    console.log(`${masked}`);
    console.log(`  user doc: ${userDoc.exists ? 'exists' : 'MISSING'}${u?.tier ? `, tier=${u.tier}` : ''}${u?.createdAt ? `, userCreated=${new Date(u.createdAt._seconds ? u.createdAt._seconds * 1000 : u.createdAt).toISOString()}` : ''}`);
    console.log(`  first game (still stored): ${firstAt}  |  total games stored: ${totalSnap.data().count}  |  ${isNew ? '>>> NEW in window' : 'returning'}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
