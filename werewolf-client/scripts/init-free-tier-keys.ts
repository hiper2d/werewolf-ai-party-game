/**
 * Script to initialize free tier API keys in Firestore
 * Run with: npx ts-node scripts/init-free-tier-keys.ts
 */

import { db } from '../firebase/server';

async function initializeFreeTierKeys() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    try {
        const configRef = db.collection('config').doc('freeTierApiKeys');

        // Check if document already exists
        const doc = await configRef.get();

        if (doc.exists) {
            console.log('❌ Free tier API keys document already exists!');
            console.log('Current keys:', Object.keys(doc.data()?.keys || {}));
            console.log('\nIf you want to update keys, use the updateFreeTierApiKey function or update manually in Firebase Console.');
            return;
        }

        // Create the document with empty keys
        await configRef.set({
            keys: {
                // Add your API keys here
                OPENAI_API_KEY: '',
                ANTHROPIC_API_KEY: '',
                GOOGLE_API_KEY: '',
                DEEPSEEK_API_KEY: '',
                MISTRAL_API_KEY: '',
                GROK_API_KEY: '',
                MOONSHOT_API_KEY: ''
            },
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        });

        console.log('✅ Free tier API keys document created successfully!');
        console.log('\n⚠️  IMPORTANT: You need to add your actual API keys to this document.');
        console.log('   You can do this either:');
        console.log('   1. Through Firebase Console at: Firestore > config > freeTierApiKeys');
        console.log('   2. By calling updateFreeTierApiKey() function for each key');
        console.log('\nExample:');
        console.log('   await updateFreeTierApiKey("OPENAI_API_KEY", "sk-your-key-here");');

    } catch (error) {
        console.error('❌ Error initializing free tier keys:', error);
        throw error;
    }
}

// Run the script
initializeFreeTierKeys()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
