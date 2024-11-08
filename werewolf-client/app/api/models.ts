import {Timestamp} from "firebase/firestore";
import {LLM_CONSTANTS} from "@/app/ai/models";

export interface ApiKeyMap {
    [id: string]: string
}

export interface User {
    name: string;
    email: string;
    apiKeys: ApiKeyMap;
}

export interface GamePreview {
    id: string;
    name: string;
    theme: string;
    playerCount: number;
    werewolfCount: number;
    specialRoles: string[];
    gameMasterAiType: string;
    playersAiType: string;
}

export interface Player {
    name: string;
    story: string;
    personality: string;
    aiType: string;
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

export interface ApiKey {
    id: string;
    apiKeyType: string;
    value: string;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface ApiKeyFirestore {
    type: string;
    value: string;
    createdAt: Timestamp | null;
    updatedAt: Timestamp | null;
}

export function gamePreviewFromFirestore(id: string, data: any): GamePreview {
    return {
        id,
        name: data.name,
        theme: data.theme,
        playerCount: data.playerCount,
        werewolfCount: data.werewolfCount,
        specialRoles: data.specialRoles,
        gameMasterAiType: data.gameMasterAiType,
        playersAiType: data.playersAiType
    };
}

export function gameFromFirestore(id: string, data: any): Game {
    return {
        ...gamePreviewFromFirestore(id, data),
        story: data.story,
        players: data.players
    };
}

export function apiKeyFromFirestore(id: string, data: ApiKeyFirestore): ApiKey {
    // Cast or validate that the string from Firestore corresponds to the enum value
    const llmModel = data.type as string; // Ensure that data.type is cast to the correct enum type

    // Optional: You can add validation if you're concerned about invalid types.
    if (!Object.values(LLM_CONSTANTS).includes(llmModel)) {
        throw new Error(`Invalid LLM model type: ${data.type}`);
    }

    return {
        id,
        apiKeyType: llmModel,  // Use the casted or validated enum value here
        value: data.value,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null
    };
}