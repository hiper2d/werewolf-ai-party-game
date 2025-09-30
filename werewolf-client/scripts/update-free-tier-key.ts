/**
 * Script to update a specific free tier API key in Firestore
 * Run with: npx ts-node scripts/update-free-tier-key.ts <KEY_NAME> <KEY_VALUE>
 *
 * Examples:
 *   npx ts-node scripts/update-free-tier-key.ts OPENAI_API_KEY "sk-..."
 *   npx ts-node scripts/update-free-tier-key.ts ANTHROPIC_API_KEY "sk-ant-..."
 */

import { db } from '../firebase/server';

const VALID_KEY_NAMES = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'DEEPSEEK_API_KEY',
    'MISTRAL_API_KEY',
    'GROK_API_KEY',
    'MOONSHOT_API_KEY'
];

async function updateFreeTierKey(keyName: string, keyValue: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Validate key name
    if (!VALID_KEY_NAMES.includes(keyName)) {
        throw new Error(`Invalid key name: ${keyName}. Valid keys are: ${VALID_KEY_NAMES.join(', ')}`);
    }

    // Validate key value
    if (!keyValue || keyValue.trim() === '') {
        throw new Error('Key value cannot be empty');
    }

    try {
        const configRef = db.collection('config').doc('freeTierApiKeys');

        // Check if document exists
        const doc = await configRef.get();
        if (!doc.exists) {
            throw new Error('Free tier API keys document does not exist. Run init-free-tier-keys.ts first.');
        }

        // Update the specific key
        await configRef.set({
            [`keys.${keyName}`]: keyValue,
            lastUpdated: new Date().toISOString()
        }, { merge: true });

        console.log(`✅ Successfully updated ${keyName}`);
        console.log(`   Value: ${keyValue.substring(0, 10)}...${keyValue.substring(keyValue.length - 4)}`);

    } catch (error) {
        console.error(`❌ Error updating ${keyName}:`, error);
        throw error;
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
    console.error('❌ Usage: npx ts-node scripts/update-free-tier-key.ts <KEY_NAME> <KEY_VALUE>');
    console.error('\nValid key names:');
    VALID_KEY_NAMES.forEach(key => console.error(`  - ${key}`));
    console.error('\nExample:');
    console.error('  npx ts-node scripts/update-free-tier-key.ts OPENAI_API_KEY "sk-..."');
    process.exit(1);
}

const [keyName, keyValue] = args;

// Run the script
updateFreeTierKey(keyName, keyValue)
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
