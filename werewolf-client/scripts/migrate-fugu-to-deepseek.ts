/**
 * One-off: move every existing game off Sakana Fugu onto DeepSeek V4 Pro.
 * Covers both model-ID fields on a game doc: gameMasterAiType and bots[].aiType,
 * including the legacy ids/display names that DEPRECATED_MODEL_MAP resolves to fugu-ultra.
 *
 * Context: see docs/model-findings.md — Fugu Ultra is 7-11x slower than the rest of the
 * roster and ~$0.59 per vote; its roster slot was taken by Qwen + MiniMax on 2026-08-05.
 * DeepSeek V4 Pro is the replacement for persisted games: a capable thinking model in the
 * cheap band, so no free-tier game becomes over-cap by this rewrite (Pro allows 3/game vs
 * Fugu's zero free-tier availability).
 *
 * Preview:  npx tsx --env-file=.env scripts/migrate-fugu-to-deepseek.ts --dry-run
 * Run:      npx tsx --env-file=.env scripts/migrate-fugu-to-deepseek.ts
 */

import { db } from '../firebase/server';

const DRY_RUN = process.argv.includes('--dry-run');

const OLD_TO_NEW: Record<string, string> = {
    'fugu-ultra': 'deepseek-pro',
    // Legacy values that resolveModelId currently maps onto fugu-ultra — send them to the
    // same destination so no doc is left pointing at Fugu through the deprecation chain.
    'fugu': 'deepseek-pro',
    'Sakana Fugu': 'deepseek-pro',
    'Sakana Fugu Ultra': 'deepseek-pro',
};

function migrateValue(value: string | undefined): string | undefined {
    if (!value) return value;
    return OLD_TO_NEW[value] ?? value;
}

async function migrateFugu() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    console.log('Migrating Fugu games to DeepSeek V4 Pro...\n');

    const gamesSnapshot = await db.collection('games').get();

    if (gamesSnapshot.empty) {
        console.log('No games found in the database.');
        return;
    }

    console.log(`Found ${gamesSnapshot.size} games\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const gameDoc of gamesSnapshot.docs) {
        const data = gameDoc.data();
        const gameId = gameDoc.id;
        const changes: string[] = [];

        const update: Record<string, any> = {};

        const newGmType = migrateValue(data.gameMasterAiType);
        if (newGmType !== data.gameMasterAiType) {
            update.gameMasterAiType = newGmType;
            changes.push(`GM: ${data.gameMasterAiType} -> ${newGmType}`);
        }

        if (Array.isArray(data.bots)) {
            let botsChanged = false;
            const updatedBots = data.bots.map((bot: any) => {
                const newAiType = migrateValue(bot.aiType);
                if (newAiType !== bot.aiType) {
                    botsChanged = true;
                    changes.push(`bot ${bot.name}: ${bot.aiType} -> ${newAiType}`);
                    return { ...bot, aiType: newAiType };
                }
                return bot;
            });
            if (botsChanged) {
                update.bots = updatedBots;
            }
        }

        if (changes.length > 0) {
            if (!DRY_RUN) {
                await gameDoc.ref.update(update);
            }
            console.log(`${DRY_RUN ? '[dry-run] Would update' : 'Updated'} ${gameId} (${data.theme ?? 'no theme'}) — ${changes.join(', ')}`);
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log('\n===================================================');
    console.log(`Migration Summary${DRY_RUN ? ' (dry run — nothing written)' : ''}:`);
    console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${updatedCount} games`);
    console.log(`  Skipped: ${skippedCount} games (no Fugu)`);
    console.log(`  Total:   ${gamesSnapshot.size} games`);
    console.log('===================================================\n');
}

migrateFugu()
    .then(() => {
        console.log('Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
