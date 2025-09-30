#!/usr/bin/env node

/**
 * Script to fix games stuck in WELCOME state with empty queue
 * Usage: npm run fix-stuck-welcome <gameId>
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'firebase', 'firebase-keys.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Firebase service account key file not found at:', serviceAccountPath);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixStuckWelcomeState(gameId?: string) {
    try {
        if (!gameId) {
            // If no gameId provided, find all games stuck in WELCOME with empty queue
            console.log('🔍 Searching for games stuck in WELCOME state...');
            
            const gamesSnapshot = await db.collection('games')
                .where('gameState', '==', 'WELCOME')
                .get();
            
            if (gamesSnapshot.empty) {
                console.log('✅ No games found in WELCOME state');
                return;
            }
            
            for (const doc of gamesSnapshot.docs) {
                const game = doc.data();
                if (!game.gameStateParamQueue || game.gameStateParamQueue.length === 0) {
                    console.log(`🎮 Found stuck game: ${doc.id}`);
                    await fixGame(doc.id);
                } else {
                    console.log(`⏭️  Game ${doc.id} has ${game.gameStateParamQueue.length} bots in queue, skipping`);
                }
            }
        } else {
            // Fix specific game
            await fixGame(gameId);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

async function fixGame(gameId: string) {
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();
    
    if (!gameDoc.exists) {
        console.log(`❌ Game ${gameId} not found`);
        return;
    }
    
    const game = gameDoc.data();
    
    if (game?.gameState === 'WELCOME' && (!game.gameStateParamQueue || game.gameStateParamQueue.length === 0)) {
        console.log(`🔧 Fixing game ${gameId}: Transitioning from WELCOME to DAY_DISCUSSION`);
        
        await gameRef.update({
            gameState: 'DAY_DISCUSSION',
            gameStateProcessQueue: [],
            gameStateParamQueue: []
        });
        
        console.log(`✅ Game ${gameId} fixed successfully!`);
    } else {
        console.log(`ℹ️  Game ${gameId} is not stuck (state: ${game?.gameState}, queue: ${game?.gameStateParamQueue?.length || 0})`);
    }
}

// Run the script
const gameId = process.argv[2];

fixStuckWelcomeState(gameId)
    .then(() => {
        console.log('🎉 Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });