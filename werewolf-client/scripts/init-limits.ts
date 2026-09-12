/**
 * Seeds the Firestore doc `config/limits` with the default free-tier limits so they can
 * be edited in the console during a traffic spike without a deploy. The app works
 * without the doc (it falls back to FREE_TIER_LIMITS per field), so this only makes the
 * knobs visible. Refuses to overwrite an existing doc.
 *
 * Run with: npx tsx --env-file=.env scripts/init-limits.ts
 */

import { db } from '../firebase/server';
import { FREE_TIER_LIMITS } from '../app/api/game-models';

async function initLimits() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const ref = db.collection('config').doc('limits');
    const doc = await ref.get();
    if (doc.exists) {
        console.log('config/limits already exists:', doc.data());
        console.log('Edit it in the Firebase console; the app re-reads it within a minute.');
        return;
    }
    const limits = {
        freeDailySpendUSD: FREE_TIER_LIMITS.DAILY_SPEND_USD,
        freeMonthlySpendUSD: FREE_TIER_LIMITS.MONTHLY_SPEND_USD,
        freeGamesPerDay: FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY,
    };
    await ref.set(limits);
    console.log('Created config/limits with the defaults:', limits);
}

initLimits()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Failed to seed config/limits:', error);
        process.exit(1);
    });
