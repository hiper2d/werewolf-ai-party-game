import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/firebase/server';
import {GAME_STATES} from "@/app/api/game-models";

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

        // Create a batch operation for deletion and game state reset
        const batch = db.batch();
        
        // Delete all messages after the target timestamp
        messagesToDeleteSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Reset game state to DAY_DISCUSSION and clear processing queues
        const gameRef = db.collection('games').doc(gameId);
        batch.update(gameRef, {
            gameState: GAME_STATES.DAY_DISCUSSION,
            gameStateProcessQueue: [],
            gameStateParamQueue: []
        });

        // Execute all operations in a single atomic transaction
        await batch.commit();
        
        return NextResponse.json({
            message: `Successfully deleted ${messagesToDeleteSnapshot.size} messages after message ${messageId} and reset game state`,
            deletedCount: messagesToDeleteSnapshot.size
        });

    } catch (error) {
        console.error('Error deleting messages:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}