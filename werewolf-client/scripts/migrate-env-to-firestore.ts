/**
 * Script to migrate API keys from .env to Firestore free tier keys
 * Run with: npx ts-node scripts/migrate-env-to-firestore.ts
 */

import { db } from '../firebase/server';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function migrateKeysToFirestore() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Map .env variables to Firestore key names
    const keyMapping = {
        'OPENAI_API_KEY': process.env.OPENAI_K,
        'ANTHROPIC_API_KEY': process.env.ANTHROPIC_K,
        'GOOGLE_API_KEY': process.env.GOOGLE_K,
        'DEEPSEEK_API_KEY': process.env.DEEP_SEEK_K,
        'MISTRAL_API_KEY': process.env.MISTRAL_K,
        'GROK_API_KEY': process.env.GROK_K,
        'MOONSHOT_API_KEY': process.env.MOONSHOT_K
    };

    console.log('🔄 Migrating API keys from .env to Firestore...\n');

    try {
        const configRef = db.collection('config').doc('freeTierApiKeys');

        // Check if document exists
        const doc = await configRef.get();

        if (doc.exists) {
            console.log('⚠️  Free tier API keys document already exists.');
            console.log('   This will UPDATE existing keys.\n');
        } else {
            console.log('📝 Creating new free tier API keys document...\n');
        }

        // Prepare keys object
        const keys: Record<string, string> = {};
        let successCount = 0;
        let missingCount = 0;

        for (const [firestoreKey, envValue] of Object.entries(keyMapping)) {
            if (envValue && envValue.trim() !== '') {
                keys[firestoreKey] = envValue;
                console.log(`✅ ${firestoreKey.padEnd(25)} ${envValue.substring(0, 10)}...${envValue.substring(envValue.length - 4)}`);
                successCount++;
            } else {
                keys[firestoreKey] = '';
                console.log(`❌ ${firestoreKey.padEnd(25)} (missing in .env)`);
                missingCount++;
            }
        }

        // Write to Firestore
        await configRef.set({
            keys: keys,
            createdAt: doc.exists ? doc.data()?.createdAt : new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            migratedFrom: '.env file'
        }, { merge: false });

        console.log('\n═══════════════════════════════════════════════════════');
        console.log(`📊 Migration Summary:`);
        console.log(`   ✅ Successfully migrated: ${successCount} keys`);
        if (missingCount > 0) {
            console.log(`   ❌ Missing keys: ${missingCount}`);
        }
        console.log('═══════════════════════════════════════════════════════\n');

        console.log('✅ All keys have been successfully migrated to Firestore!');
        console.log('\n📍 Location: /config/freeTierApiKeys');
        console.log('\nYou can verify by running:');
        console.log('   npx ts-node scripts/view-free-tier-keys.ts');

    } catch (error) {
        console.error('❌ Error migrating keys:', error);
        throw error;
    }
}

// Run the script
migrateKeysToFirestore()
    .then(() => {
        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    });
