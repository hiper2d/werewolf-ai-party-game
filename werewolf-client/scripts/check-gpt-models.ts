/**
 * Script to find and migrate games using old GPT model IDs in Firestore.
 * Migrates 'gpt-5.4' -> 'gpt' (GPT_5_4 was removed, GPT_5 now points to gpt-5.4).
 *
 * Dry run (default): npx tsx scripts/check-gpt-models.ts
 * Apply migration:   npx tsx scripts/check-gpt-models.ts --apply
 */

import { db } from '../firebase/server';

const OLD_TO_NEW: Record<string, string> = {
    'gpt-5.4': 'gpt', // GPT_5_4 removed, migrate to GPT_5
};

async function checkAndMigrateGptModels() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const dryRun = !process.argv.includes('--apply');
    console.log(dryRun ? 'DRY RUN (use --apply to migrate)\n' : 'APPLYING MIGRATION\n');

    const gamesSnapshot = await db.collection('games').get();

    if (gamesSnapshot.empty) {
        console.log('No games found in the database.');
        return;
    }

    console.log(`Found ${gamesSnapshot.size} games total\n`);

    let matchCount = 0;
    let updatedCount = 0;

    for (const gameDoc of gamesSnapshot.docs) {
        const data = gameDoc.data();
        const gameId = gameDoc.id;
        let changed = false;
        const update: Record<string, any> = {};

        // Check gameMasterAiType
        if (data.gameMasterAiType && OLD_TO_NEW[data.gameMasterAiType]) {
            const newValue = OLD_TO_NEW[data.gameMasterAiType];
            console.log(`  Game ${gameId}: gameMasterAiType '${data.gameMasterAiType}' -> '${newValue}'`);
            update.gameMasterAiType = newValue;
            changed = true;
            matchCount++;
        }

        // Check bots array
        if (Array.isArray(data.bots)) {
            const updatedBots = data.bots.map((bot: any) => {
                if (bot.aiType && OLD_TO_NEW[bot.aiType]) {
                    const newValue = OLD_TO_NEW[bot.aiType];
                    console.log(`  Game ${gameId}: bot '${bot.name ?? 'unknown'}' aiType '${bot.aiType}' -> '${newValue}'`);
                    matchCount++;
                    changed = true;
                    return { ...bot, aiType: newValue };
                }
                return bot;
            });
            if (changed) {
                update.bots = updatedBots;
            }
        }

        if (changed && !dryRun) {
            await gameDoc.ref.update(update);
            updatedCount++;
        }
    }

    console.log('\n===================================================');
    console.log(`Found ${matchCount} references to old GPT model IDs`);
    if (!dryRun) {
        console.log(`Updated ${updatedCount} games`);
    }
    console.log('===================================================\n');
}

checkAndMigrateGptModels()
    .then(() => {
        console.log('Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Script failed:', error);
        process.exit(1);
    });
