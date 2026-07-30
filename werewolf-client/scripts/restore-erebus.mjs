// Restore the Erebus game after the 2026-07-23 fixed-TTL deletion (see the sliding-TTL
// fix in game-actions.ts). Creates a complete game document + all 44 Day-1 messages,
// reconstructed from Simona's video-capture dumps. State = VOTE_RESULTS with Rook
// (doctor) eliminated, ready for Start Night.
//
// Usage: node scripts/restore-erebus.mjs <path-to-restore-data.json>

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// --- env (.env in werewolf-client; dotenv handles the multi-line private key) ---
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
const env = dotenv.parse(readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8'));
const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore(app);

const restore = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const OWNER = 'hiper2d@gmail.com';
const NOW = Date.now();
const GAME_ID = `erebus-${NOW}`;
const CREATED_AT = 1782258665318; // original creation, 2026-06-23 - keep the story's clock
const expireAt = Timestamp.fromMillis(NOW + 30 * 24 * 60 * 60 * 1000);

const STORY =
  'The colony ship Erebus was meant to sleep three hundred years. It woke its crew early - ' +
  'reactor failing, corridors freezing, no rescue coming. Now the dead are turning up at the ' +
  'airlocks, one by one, and something is picking through the crew from the inside.';

// name, story (rebuilt from each bot's public intro), aiType, gender, voice, role
const BOTS = [
  ['Kael',  'Reactor technician who has crawled the vents for years and believes the reactor failure was sabotage. Vigilant, conspiratorial, scans every shadow.', 'grok', 'male', 'echo', 'villager'],
  ['Mira',  'Ship medic haunted by the bodies she could not save. Compassionate but steely; refuses to let panic turn the crew on itself.', 'claude-fable', 'female', 'nova', 'villager'],
  ['Jax',   'Head of security with a holstered sidearm and a short fuse. Believes in rooting out threats directly; talks of cornering the monsters.', 'deepseek-pro-thinking', 'male', 'onyx', 'werewolf'],
  ['Elara', 'Keeper of the ship data banks - logs, manifests, cryo records. Quiet observer who speaks only when certain; the archives answer to her.', 'claude-opus-thinking', 'female', 'shimmer', 'detective'],
  ['Finn',  'Vent technician who trusts his gut and swears he saw something move near the starboard engine room during the blackout.', 'deepseek-flash-thinking', 'male', 'ash', 'villager'],
  ['Vera',  'Ex-recon pilot who caught Command falsifying the flight coordinates and stopped following orders. Sharp instincts, trusts no chorus.', 'glm-thinking', 'female', 'coral', 'villager'],
  ['Dax',   'Navigator still plotting rescue vectors against a silent sky. Patient, methodical; judges people by pressure, votes, and contradictions.', 'gpt', 'male', 'ballad', 'villager'],
  ['Lyra',  'Communications officer fighting dead frequencies. Found gaps in the transmission logs that do not match system failures.', 'glm', 'female', 'sage', 'werewolf'],
  ['Rook',  'Heavy-duty maintenance. Tired of patching a ship being chewed from the inside; loud, blunt, bites back when questioned.', 'gemini-flash', 'male', 'fable', 'doctor'],
  ['Jace',  'Hydroponics intern, shaking since the lights died. Saw data overwritten during the blackouts and heard things moving in the walls.', 'mistral-medium', 'male', 'echo', 'maniac'],
  ['Nola',  'Biologist running the hydroponics bay. Deals in verifiable facts: tissue samples, override timestamps, observable behavior.', 'gemini-flash', 'female', 'alloy', 'villager'],
];

const bots = BOTS.map(([name, story, aiType, gender, voice, role]) => ({
  name, story, role, aiType, gender, voice,
  isAlive: name !== 'Rook',
  playStyle: name === 'Rook' ? 'aggressive_provoker' : 'normal',
  ...(name === 'Rook' ? { eliminationDay: 1 } : {}),
}));

const game = {
  name: 'Erebus',
  theme: 'Erebus',
  description: STORY,
  story: STORY,
  werewolfCount: 3,
  specialRoles: ['doctor', 'detective', 'maniac'],
  gameMasterAiType: 'gemini-lite',
  gameMasterVoice: 'onyx',
  gameMasterVoiceStyle: 'ominously',
  voiceProvider: 'openai',
  bots,
  humanPlayerName: 'Selkie',
  humanPlayerRole: 'werewolf',
  humanPlayerIsAlive: true,
  currentDay: 1,
  gameState: 'VOTE_RESULTS',
  gameStateParamQueue: [],
  gameStateProcessQueue: [],
  messageCounter: restore.messages.length,
  votingHistory: restore.votingHistory,
  ownerEmail: OWNER,
  createdAt: CREATED_AT,
  expireAt,
  createdWithTier: 'paid',
  totalGameCost: 0,
  gameMasterTokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 },
};

const sanitize = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// message timestamps: phase-faithful (intros Jun 23, discussion Jul 3-5, votes Jul 19)
function tsFor(i) {
  if (i < 12) return CREATED_AT + i * 60_000;                       // Jun 23: intros
  if (i < 30) return 1783108800000 + (i - 12) * 120_000;            // Jul 3-5: discussion
  return 1784489400000 + (i - 30) * 60_000;                         // Jul 19: votes + results
}

async function main() {
  const gameRef = db.collection('games').doc(GAME_ID);
  await gameRef.set(game);
  console.log(`game doc created: ${GAME_ID}`);

  let counter = 0;
  for (const m of restore.messages) {
    counter += 1;
    const id = `${String(counter).padStart(6, '0')}-${sanitize(m.authorName)}-to-${sanitize(m.recipientName)}`;
    await gameRef.collection('messages').doc(id).set({
      recipientName: m.recipientName,
      authorName: m.authorName,
      msg: m.msg,
      messageType: m.messageType,
      day: m.day,
      timestamp: tsFor(counter - 1),
      cost: 0,
      expireAt,
    });
  }
  console.log(`${counter} messages written`);
  console.log(`URL: https://aiwerewolf.net/games/${GAME_ID}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
