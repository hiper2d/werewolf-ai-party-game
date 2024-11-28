import {Timestamp} from "firebase/firestore";

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
    name: string;
    story: string;
    role: string;
    isAlive: boolean;
    aiType: string;
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
    currentDay: number;
    gameState: string;
    gameStateParamQueue: Array<string>; // some states require a queue of params, usually bot names
    gameStateProcessQueue: Array<string>; // some states need to keep intermediate results
}

// todo: Merge with AgentMessageDto
export interface Message {
    id: string;
    text: string;
    timestamp: Timestamp;
    sender: string;
    recipient: string,
    gameId: string;
}

export const GAME_ROLES = {
    DOCTOR: 'doctor',
    DETECTIVE: 'detective',
    WEREWOLF: 'werewolf',
    VILLAGER: 'villager'
} as const;

export const GAME_STATES = {
    WELCOME: 'WELCOME',
    DAY_DISCUSSION: 'DAY_DISCUSSION',
} as const;

export enum MessageType {
    GAME_MASTER_ASK = 'GAME_MASTER_ASK',
    BOT_ANSWER = 'BOT_ANSWER',
    GAME_STORY = 'GAME_STORY',
    HUMAN_PLAYER_MESSAGE = 'HUMAN_PLAYER_MESSAGE',
}

export interface BaseMessage {
    type: MessageType;
}

export class BotAnswer implements BaseMessage {
    type: MessageType = MessageType.BOT_ANSWER;
    
    constructor(public reply: string) {}
}

export class GameStory implements BaseMessage {
    type: MessageType = MessageType.GAME_STORY;
    
    constructor(public story: string) {}
}

export const MESSAGE_ROLE = {
    SYSTEM: "system" as const,
    USER: "user" as const,
    ASSISTANT: "assistant" as const,
    TOOL: "tool" as const
} as const;

export const GAME_MASTER = 'Game Master';
export const RECIPIENT_ALL = 'all';

export interface GameMessage {
    recipientName: string;
    authorName: string;
    role: string;
    msg: any;
    messageType: string;
}

export interface FirestoreGameMessage extends GameMessage {
    id: string;
    timestamp: number; // UTC epoch timestamp in milliseconds
    gameId: string;
}