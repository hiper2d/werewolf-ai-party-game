/**
 * Script to backfill 'expireAt' field on existing games and their messages for Firestore TTL.
 * Sets expireAt to 30 days from now so existing documents get cleaned up by TTL policy.
 * Run with: npx tsx scripts/backfill-expire-at.ts
 */

import { db } from '../firebase/server';
import { firestore } from 'firebase-admin';

const TTL_DAYS = 30;

async function backfillExpireAt() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    console.log('Adding expireAt field to existing games and messages...\n');

    const expireAt = firestore.Timestamp.fromMillis(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
    console.log(`expireAt will be set to: ${expireAt.toDate().toISOString()} (${TTL_DAYS} days from now)\n`);

    const gamesSnapshot = await db.collection('games').get();

    if (gamesSnapshot.empty) {
        console.log('No games found.');
        return;
    }

    console.log(`Found ${gamesSnapshot.size} games\n`);

    let gamesUpdated = 0;
    let gamesSkipped = 0;
    let messagesUpdated = 0;

    for (const gameDoc of gamesSnapshot.docs) {
        const gameData = gameDoc.data();

        // Skip games that already have expireAt
        if (gameData.expireAt) {
            console.log(`Skipping game ${gameDoc.id} - already has expireAt`);
            gamesSkipped++;
            continue;
        }

        // Update the game document
        await gameDoc.ref.update({ expireAt });
        gamesUpdated++;
        console.log(`Updated game ${gameDoc.id}`);

        // Update all messages in this game's subcollection
        const messagesSnapshot = await gameDoc.ref.collection('messages').get();
        if (!messagesSnapshot.empty) {
            const batch = db.batch();
            let batchCount = 0;

            for (const msgDoc of messagesSnapshot.docs) {
                batch.update(msgDoc.ref, { expireAt });
                batchCount++;

                // Firestore batches are limited to 500 operations
                if (batchCount === 500) {
                    await batch.commit();
                    messagesUpdated += batchCount;
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
                messagesUpdated += batchCount;
            }

            console.log(`  Updated ${messagesSnapshot.size} messages`);
        }
    }

    console.log('\n===================================================');
    console.log('Migration Summary:');
    console.log(`  Games updated: ${gamesUpdated}`);
    console.log(`  Games skipped: ${gamesSkipped} (already had expireAt)`);
    console.log(`  Messages updated: ${messagesUpdated}`);
    console.log(`  Total games: ${gamesSnapshot.size}`);
    console.log('===================================================\n');
}

backfillExpireAt()
    .then(() => {
        console.log('Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Script failed:', error);
        process.exit(1);
    });
