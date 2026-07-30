// One-off: switch a bot's model directly in Firestore (bypasses the UI dialog).
// Usage: node scripts/switch-bot-model.mjs <gameId> <botName> <newAiType>
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = dotenv.parse(readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8'));
const app = initializeApp({ credential: cert({
  projectId: env.FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  privateKey: env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
})});
const db = getFirestore(app);

const [gameId, botName, newAiType] = process.argv.slice(2);
const ref = db.collection('games').doc(gameId);
const snap = await ref.get();
if (!snap.exists) { console.error('game not found'); process.exit(1); }
const bots = snap.data().bots;
const bot = bots.find(b => b.name === botName);
if (!bot) { console.error('bot not found:', botName); process.exit(1); }
const old = bot.aiType;
bot.aiType = newAiType;
await ref.update({ bots });
console.log(`${botName}: ${old} -> ${newAiType}`);
process.exit(0);
