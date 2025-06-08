import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/firebase/server';
import {GAME_STATES, Bot, Game} from "@/app/api/game-models";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: gameId } = await params;
        const { messageId } = await request.json();

        if (!gameId || !messageId) {
            return NextResponse.json(
                { error: 'Game ID and message ID are required' },
                { status: 400 }
            );
        }

        if (!db) {
            return NextResponse.json(
                { error: 'Firestore is not initialized' },
                { status: 500 }
            );
        }

        // First, get the timestamp of the target message
        const targetMessageDoc = await db.collection('games')
            .doc(gameId)
            .collection('messages')
            .doc(messageId)
            .get();

        if (!targetMessageDoc.exists) {
            return NextResponse.json(
                { error: `Message with ID ${messageId} not found in game ${gameId}` },
                { status: 404 }
            );
        }

        const targetTimestamp = targetMessageDoc.data()?.timestamp;
        if (!targetTimestamp) {
            return NextResponse.json(
                { error: 'Target message has no timestamp' },
                { status: 400 }
            );
        }

        // Query all messages after the target timestamp
        const messagesToDeleteSnapshot = await db.collection('games')
            .doc(gameId)
            .collection('messages')
            .where('timestamp', '>', targetTimestamp)
            .get();

        if (messagesToDeleteSnapshot.empty) {
            return NextResponse.json(
                { message: 'No messages found after the specified message', deletedCount: 0 },
                { status: 200 }
            );
        }

        // Get current game state to check current day and bot status
        const gameDoc = await db.collection('games').doc(gameId).get();
        if (!gameDoc.exists) {
            return NextResponse.json(
                { error: 'Game not found' },
                { status: 404 }
            );
        }
        
        const gameData = gameDoc.data() as Game;
        const currentDay = gameData.currentDay;
        
        // Reset bots that were eliminated on the current day
        const restoredBots = gameData.bots.map((bot: Bot) => {
            if (!bot.isAlive && bot.eliminationDay === currentDay) {
                // Bot was eliminated today, restore them
                console.log(`🔄 RESTORING BOT: ${bot.name} (eliminated on day ${bot.eliminationDay})`);
                return { ...bot, isAlive: true, eliminationDay: undefined };
            }
            return bot;
        });
        
        const restoredBotNames = restoredBots
            .filter((bot: Bot, index: number) => !gameData.bots[index].isAlive && bot.isAlive)
            .map((bot: Bot) => bot.name);
            
        if (restoredBotNames.length > 0) {
            console.log(`🎭 RESET SUMMARY: Restored ${restoredBotNames.length} bot(s) - ${restoredBotNames.join(', ')}`);
        }

        // Create a batch operation for deletion and game state reset
        const batch = db.batch();
        
        // Delete all messages after the target timestamp
        messagesToDeleteSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Reset game state to DAY_DISCUSSION, clear processing queues, and restore bots
        const gameRef = db.collection('games').doc(gameId);
        batch.update(gameRef, {
            gameState: GAME_STATES.DAY_DISCUSSION,
            gameStateProcessQueue: [],
            gameStateParamQueue: [],
            bots: restoredBots
        });

        // Execute all operations in a single atomic transaction
        await batch.commit();
        
        // Count restored bots
        const restoredBotCount = restoredBots.filter((bot: Bot, index: number) => {
            const originalBot = gameData.bots[index];
            return !originalBot.isAlive && bot.isAlive;
        }).length;
        
        return NextResponse.json({
            message: `Successfully deleted ${messagesToDeleteSnapshot.size} messages after message ${messageId}, reset game state${restoredBotCount > 0 ? `, and restored ${restoredBotCount} bot(s) eliminated today` : ''}`,
            deletedCount: messagesToDeleteSnapshot.size,
            restoredBots: restoredBotCount
        });

    } catch (error) {
        console.error('Error deleting messages:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}