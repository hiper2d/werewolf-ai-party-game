/**
 * Script to add 'tier' field to existing users in Firestore
 * Run with: npx tsx scripts/add-tier-to-users.ts
 */

import { db } from '../firebase/server';

async function addTierToExistingUsers() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    console.log('🔄 Adding tier field to existing users...\n');

    try {
        // Get all users
        const usersSnapshot = await db.collection('users').get();

        if (usersSnapshot.empty) {
            console.log('ℹ️  No users found in the database.');
            return;
        }

        console.log(`📊 Found ${usersSnapshot.size} users\n`);

        let updatedCount = 0;
        let skippedCount = 0;

        // Process each user
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const userId = userDoc.id;

            // Check if tier already exists
            if (userData.tier) {
                console.log(`⏭️  Skipping ${userId} - already has tier: ${userData.tier}`);
                skippedCount++;
                continue;
            }

            // Add tier field (default to 'free')
            await userDoc.ref.update({
                tier: 'free'
            });

            console.log(`✅ Updated ${userId} - added tier: free`);
            updatedCount++;
        }

        console.log('\n═══════════════════════════════════════════════════════');
        console.log(`📊 Migration Summary:`);
        console.log(`   ✅ Updated: ${updatedCount} users`);
        console.log(`   ⏭️  Skipped: ${skippedCount} users (already had tier)`);
        console.log(`   📋 Total: ${usersSnapshot.size} users`);
        console.log('═══════════════════════════════════════════════════════\n');

        if (updatedCount > 0) {
            console.log('✅ All users have been updated with the tier field!');
            console.log('   Default tier: free');
        } else {
            console.log('ℹ️  No updates were needed - all users already have tier field.');
        }

    } catch (error) {
        console.error('❌ Error updating users:', error);
        throw error;
    }
}

// Run the script
addTierToExistingUsers()
    .then(() => {
        console.log('\n✅ Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
