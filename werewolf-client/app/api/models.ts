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
    name: string;
    description: string;
    theme: string;
    playerCount: number;
    werewolfCount: number;
    specialRoles: string[];
    gameMasterAiType: string;
    playersAiType: string;
}

export interface BotPreview {
    name: string;
    story: string;
    playerAiType: string;
}

export interface GamePreviewWithGeneratedBots extends GamePreview {
    scene: string;
    bots: BotPreview[];
}

export interface Bot {
    id: string;
    name: string;
    story: string;
    role: string;
    isAlive: boolean;
}

export interface Player {
    id: string;
    name: string;
    story: string;
    role: string;
    isAlive: boolean;
    isBot: boolean;
}

export interface Game {
    id: string;
    description: string;
    theme: string;
    werewolfCount: number;
    specialRoles: string[];
    gameMasterAiType: string;
    story: string;
    bots: Bot[];
    humanPlayerName: string;
    humanPlayerRole: string;
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

// todo: update this to use Game object
export function gamePreviewFromFirestore(id: string, data: any): GamePreviewWithGeneratedBots {
    return {
        name: data.name,
        description: data.description,
        theme: data.theme,
        playerCount: data.playerCount,
        werewolfCount: data.werewolfCount,
        specialRoles: data.specialRoles,
        gameMasterAiType: data.gameMasterAiType,
        playersAiType: data.playersAiType,
        scene: data.scene,
        bots: data.bots
    };
}

// todo: update this to use Game object
export function gameFromFirestore(id: string, data: any): Game {
    return {
        id,
        description: data.description,
        theme: data.theme,
        werewolfCount: data.werewolfCount,
        specialRoles: data.specialRoles,
        gameMasterAiType: data.gameMasterAiType,
        story: data.story,
        bots: data.bots,
        humanPlayerName: data.humanPlayerName,
        humanPlayerRole: data.humanPlayerRole
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

export const GAME_ROLES = {
    DOCTOR: 'doctor',
    DETECTIVE: 'datective',
    WEREWOLF: 'werewolf',
    VILLAGER: 'villager'
} as const;