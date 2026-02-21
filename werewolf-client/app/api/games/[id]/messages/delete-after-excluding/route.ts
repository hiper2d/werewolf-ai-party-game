import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/firebase/server';
import {GAME_STATES, Bot, Game, FREE_TIER_LIMITS} from "@/app/api/game-models";
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

        // Query all messages after the target timestamp (excluding the target message itself)
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

        // Enforce chat reset limit for free-tier games
        if (gameData.createdWithTier === 'free') {
            const currentResets = gameData.chatResetCounts?.[currentDay] ?? 0;
            if (currentResets >= FREE_TIER_LIMITS.CHAT_RESETS_PER_GAME_DAY) {
                return NextResponse.json(
                    { error: `Free tier limit reached: you can reset chat up to ${FREE_TIER_LIMITS.CHAT_RESETS_PER_GAME_DAY} times per game day. Switch to API tier for unlimited resets.` },
                    { status: 429 }
                );
            }
        }

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
            const updateData: Record<string, any> = {
                gameState: targetGameState,
                gameStateProcessQueue: [],
                gameStateParamQueue: [],
                bots: restoredBots,
            };
            // Increment chat reset counter for free-tier games
            if (gameData.createdWithTier === 'free') {
                updateData[`chatResetCounts.${currentDay}`] = (gameData.chatResetCounts?.[currentDay] ?? 0) + 1;
            }
            await gameRef.update(updateData);
            console.log(`✅ Game state update successful (set to ${targetGameState})`);

            // Delete only messages after the target (excluding the target message itself)
            const docsToDelete = messagesAfterSnapshot.docs;
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

        const deletedCount = messagesAfterSnapshot.size; // Exclude the target message from count

        return NextResponse.json({
            message: `Successfully deleted ${deletedCount} message${deletedCount === 1 ? '' : 's'} after message ${messageId}, reset game state${restoredBotCount > 0 ? `, and restored ${restoredBotCount} bot(s) eliminated today` : ''}`,
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
