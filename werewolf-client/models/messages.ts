import {DocumentData, Timestamp} from 'firebase/firestore';

export class Message {
    id: string;
    text: string;
    timestamp: Timestamp;
    sender: string;
    gameId: string;

    constructor(id: string, text: string, timestamp: Timestamp, sender: string, gameId: string) {
        this.id = id;
        this.text = text;
        this.timestamp = timestamp;
        this.sender = sender;
        this.gameId = gameId;
    }

    static fromFirestore(id: string, snapshot: DocumentData): Message {
        const data = snapshot;
        return new Message(
            id,
            data.text,
            data.timestamp,
            data.sender,
            data.gameId
        );
    }

    toFirestore(): DocumentData {
        return {
            text: this.text,
            timestamp: this.timestamp,
            sender: this.sender,
            gameId: this.gameId
        };
    }
}