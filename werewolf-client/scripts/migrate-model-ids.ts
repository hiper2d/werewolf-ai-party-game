/**
 * Script to migrate AI model references from old display names to new stable IDs in Firestore.
 * Run with: npx tsx scripts/migrate-model-ids.ts
 */

import { db } from '../firebase/server';

const OLD_TO_NEW: Record<string, string> = {
    'Claude 4.6 Opus': 'claude-opus',
    'Claude 4.6 Opus (Thinking)': 'claude-opus-thinking',
    'Claude 4.6 Sonnet': 'claude-sonnet',
    'Claude 4.6 Sonnet (Thinking)': 'claude-sonnet-thinking',
    'Claude 4.5 Haiku': 'claude-haiku',
    'Claude 4.5 Haiku (Thinking)': 'claude-haiku-thinking',
    'DeepSeek Chat': 'deepseek-chat',
    'DeepSeek Reasoner': 'deepseek-reasoner',
    'GPT-5.2': 'gpt',
    'GPT-5-mini': 'gpt-mini',
    'Gemini 3.1 Pro Preview': 'gemini-pro',
    'Gemini 3 Flash Preview': 'gemini-flash',
    'Mistral Large 3': 'mistral-large',
    'Mistral Medium 3.1': 'mistral-medium',
    'Magistral Medium 1.2 (Thinking)': 'mistral-magistral',
    'Grok 4': 'grok',
    'Grok 4.1 Fast Reasoning': 'grok-fast',
    'Kimi K2': 'kimi',
    'Kimi K2 (Thinking)': 'kimi-thinking',
    'Kimi K2.5': 'kimi-k2.5',
    'Kimi K2.5 (Thinking)': 'kimi-k2.5-thinking',
    'Random': 'random',
};

function migrateValue(value: string | undefined): string | undefined {
    if (!value) return value;
    return OLD_TO_NEW[value] ?? value;
}

async function migrateModelIds() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    console.log('Migrating AI model IDs in games collection...\n');

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
        let changed = false;

        const update: Record<string, any> = {};

        // Migrate gameMasterAiType
        const newGmType = migrateValue(data.gameMasterAiType);
        if (newGmType !== data.gameMasterAiType) {
            update.gameMasterAiType = newGmType;
            changed = true;
        }

        // Migrate bots array
        if (Array.isArray(data.bots)) {
            const updatedBots = data.bots.map((bot: any) => {
                const newAiType = migrateValue(bot.aiType);
                if (newAiType !== bot.aiType) {
                    changed = true;
                    return { ...bot, aiType: newAiType };
                }
                return bot;
            });
            if (changed && !update.gameMasterAiType) {
                // Only bots changed
            }
            if (updatedBots.some((bot: any, i: number) => bot !== data.bots[i])) {
                update.bots = updatedBots;
            }
        }

        if (changed) {
            await gameDoc.ref.update(update);
            console.log(`Updated ${gameId} — GM: ${data.gameMasterAiType} -> ${update.gameMasterAiType ?? '(unchanged)'}`);
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log('\n===================================================');
    console.log('Migration Summary:');
    console.log(`  Updated: ${updatedCount} games`);
    console.log(`  Skipped: ${skippedCount} games (already migrated or no AI types)`);
    console.log(`  Total:   ${gamesSnapshot.size} games`);
    console.log('===================================================\n');
}

migrateModelIds()
    .then(() => {
        console.log('Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Script failed:', error);
        process.exit(1);
    });
