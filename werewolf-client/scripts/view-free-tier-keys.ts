/**
 * Script to view current free tier API keys in Firestore (masked for security)
 * Run with: npx ts-node scripts/view-free-tier-keys.ts
 */

import { db } from '../firebase/server';

function maskKey(key: string): string {
    if (!key || key === '') {
        return '(empty)';
    }
    if (key.length <= 10) {
        return '***...***';
    }
    return `${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
}

async function viewFreeTierKeys() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    try {
        const configRef = db.collection('config').doc('freeTierApiKeys');
        const doc = await configRef.get();

        if (!doc.exists) {
            console.log('❌ Free tier API keys document does not exist.');
            console.log('   Run: npx ts-node scripts/init-free-tier-keys.ts');
            return;
        }

        const data = doc.data();
        const keys = data?.keys || {};
        const createdAt = data?.createdAt;
        const lastUpdated = data?.lastUpdated;

        console.log('📋 Free Tier API Keys Status\n');
        console.log('═══════════════════════════════════════════════════════');

        Object.entries(keys).forEach(([keyName, keyValue]) => {
            const status = keyValue ? '✅' : '❌';
            const maskedValue = maskKey(keyValue as string);
            console.log(`${status} ${keyName.padEnd(25)} ${maskedValue}`);
        });

        console.log('═══════════════════════════════════════════════════════');
        console.log(`\nCreated: ${createdAt || 'N/A'}`);
        console.log(`Last Updated: ${lastUpdated || 'N/A'}`);

        // Count configured keys
        const configuredCount = Object.values(keys).filter(v => v && v !== '').length;
        const totalCount = Object.keys(keys).length;

        console.log(`\n📊 Summary: ${configuredCount}/${totalCount} keys configured`);

        if (configuredCount < totalCount) {
            console.log('\n⚠️  Some keys are missing. Update them using:');
            console.log('   npx ts-node scripts/update-free-tier-key.ts <KEY_NAME> <KEY_VALUE>');
        }

    } catch (error) {
        console.error('❌ Error viewing free tier keys:', error);
        throw error;
    }
}

// Run the script
viewFreeTierKeys()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
