import { DocumentData, Timestamp } from "firebase/firestore";

export interface GamePreview {
    id: string;
    name: string;
    theme: string;
    playerCount: number;
    werewolfCount: number;
    specialRoles: string[];
    aiModel: string;
}

export interface Player {
    name: string;
    story: string;
    personality: string;
}

export interface Game extends GamePreview {
    story: string;
    players: Player[];
}

export interface Message {
    id: string;
    text: string;
    timestamp: Timestamp;
    sender: string;
    gameId: string;
}

export function gamePreviewFromFirestore(id: string, data: any): GamePreview {
    return {
        id,
        name: data.name,
        theme: data.theme,
        playerCount: data.playerCount,
        werewolfCount: data.werewolfCount,
        specialRoles: data.specialRoles,
        aiModel: data.aiModel
    };
}

export function gameFromFirestore(id: string, data: any): Game {
    return {
        ...gamePreviewFromFirestore(id, data),
        story: data.story,
        players: data.players
    };
}