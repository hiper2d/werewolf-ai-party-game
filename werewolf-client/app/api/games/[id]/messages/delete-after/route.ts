import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/firebase/server';
import {GAME_STATES, Bot, Game} from "@/app/api/game-models";
import {recalculateDayActivity} from "@/app/api/bot-actions";
import {auth} from "@/auth";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session || !session.user?.email) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

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
        const messagesAfterSnapshot = await db.collection('games')
            .doc(gameId)
            .collection('messages')
            .where('timestamp', '>', targetTimestamp)
            .get();

        // Get current game state to check current day and bot status
        const gameDoc = await db.collection('games').doc(gameId).get();
        if (!gameDoc.exists) {
            return NextResponse.json(
                { error: 'Game not found' },
                { status: 404 }
            );
        }
        
        const gameData = gameDoc.data() as Game;

        // Verify ownership
        if ((gameData as any).ownerEmail && (gameData as any).ownerEmail !== session.user!.email) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const currentDay = gameData.currentDay;

        // Reset bots that were eliminated on the current day
        // Preserve token usage costs even when resetting bots
        const restoredBots = gameData.bots.map((bot: Bot) => {
            if (!bot.isAlive && bot.eliminationDay === currentDay) {
                // Bot was eliminated today, restore them but preserve costs
                console.log(`🔄 RESTORING BOT: ${bot.name} (eliminated on day ${bot.eliminationDay}), preserving costs: $${bot.tokenUsage?.costUSD?.toFixed(4) || '0.0000'}`);
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

        // Determine target game state: stay in AFTER_GAME_DISCUSSION if already there, otherwise DAY_DISCUSSION
        const targetGameState = gameData.gameState === GAME_STATES.AFTER_GAME_DISCUSSION 
            ? GAME_STATES.AFTER_GAME_DISCUSSION 
            : GAME_STATES.DAY_DISCUSSION;

        try {
            // Update game state first
            await gameRef.update({
                gameState: targetGameState,
                gameStateProcessQueue: [],
                gameStateParamQueue: [],
                bots: restoredBots
            });
            console.log(`✅ Game state update successful (set to ${targetGameState})`);

            // Then delete the target message and everything after it
            const docsToDelete = [targetMessageDoc, ...messagesAfterSnapshot.docs];
            const deletePromises = docsToDelete.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);
            console.log(`✅ Message deletion successful (removed ${docsToDelete.length} message(s))`);

            // Recalculate day activity counter from remaining messages
            await recalculateDayActivity(gameId, currentDay);
            console.log('✅ Day activity counter recalculated');
        } catch (error) {
            console.error('❌ Operations failed:', error);
            throw new Error(`Failed to reset game: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Count restored bots
        const restoredBotCount = restoredBots.filter((bot: Bot, index: number) => {
            const originalBot = gameData.bots[index];
            return !originalBot.isAlive && bot.isAlive;
        }).length;
        
        const deletedCount = messagesAfterSnapshot.size + 1; // Include the target message itself

        return NextResponse.json({
            message: `Successfully deleted ${deletedCount} message${deletedCount === 1 ? '' : 's'} at and after message ${messageId}, reset game state${restoredBotCount > 0 ? `, and restored ${restoredBotCount} bot(s) eliminated today` : ''}`,
            deletedCount,
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
