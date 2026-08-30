import { db } from "../firebase/server";
(async () => {
  const snap = await db!.collection('games').doc(process.argv[2]).collection('avatars').get();
  console.log('docs:', snap.size);
  snap.docs.forEach(d => {
    const v: any = d.data();
    console.log(`  ${d.id}  mime=${v.mime}  bytes=${(v.data||'').length}`);
  });
})();
