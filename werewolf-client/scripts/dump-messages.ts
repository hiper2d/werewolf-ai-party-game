import { db } from "../firebase/server";
(async () => {
  const snap = await db!.collection('games').doc(process.argv[2]).collection('messages').orderBy('timestamp').get();
  console.log('count:', snap.size);
  snap.docs.slice(0, 4).forEach(d => {
    const v: any = d.data();
    console.log(`--- id=${d.id} type=${v.messageType} author=${v.authorName} recip=${v.recipientName} day=${v.day} ts=${v.timestamp}`);
    console.log('    msg:', JSON.stringify(v.msg).slice(0, 220));
  });
})();
