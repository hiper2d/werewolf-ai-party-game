import { db } from "../firebase/server";
(async () => {
  const s = await db!.collection('games').doc(process.argv[2]).collection('messages').doc(process.argv[3]).get();
  const d: any = s.data();
  for (const k of Object.keys(d).sort()) {
    const v = d[k];
    console.log(k, '=', typeof v === 'object' && v !== null ? '{' + Object.keys(v).join(',') + '}' : JSON.stringify(v));
  }
})();
