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
                const { eliminationDay, ...botWithoutEliminationDay } = bot;
                return { ...botWithoutEliminationDay, isAlive: true };
            }
            return bot;
        });
        
        const restoredBotNames = restoredBots
            .filter((bot: Bot, index: number) => !gameData.bots[index].isAlive && bot.isAlive)
            .map((bot: Bot) => bot.name);
            
        if (restoredBotNames.length > 0) {
            console.log(`🎭 RESET SUMMARY: Restored ${restoredBotNames.length} bot(s) - ${restoredBotNames.join(', ')}`);
        }

        // First, update the game state (separate from message deletion)
        const gameRef = db.collection('games').doc(gameId);
        
        console.log('🔧 Updating game state with:', {
            gameState: GAME_STATES.DAY_DISCUSSION,
            processQueueLength: 0,
            paramQueueLength: 0,
            botsCount: restoredBots.length,
            restoredBots: restoredBots.map(bot => ({ name: bot.name, isAlive: bot.isAlive }))
        });

        try {
            // Update game state first
            await gameRef.update({
                gameState: GAME_STATES.DAY_DISCUSSION,
                gameStateProcessQueue: [],
                gameStateParamQueue: [],
                bots: restoredBots
            });
            console.log('✅ Game state update successful');

            // Then delete messages in a separate batch
            if (!messagesToDeleteSnapshot.empty) {
                const deleteBatch = db.batch();
                messagesToDeleteSnapshot.docs.forEach(doc => {
                    deleteBatch.delete(doc.ref);
                });
                
                await deleteBatch.commit();
                console.log('✅ Message deletion batch successful');
            }
        } catch (error) {
            console.error('❌ Operations failed:', error);
            throw new Error(`Failed to reset game: ${error instanceof Error ? error.message : String(error)}`);
        }
        
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