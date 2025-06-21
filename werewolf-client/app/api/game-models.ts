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
    theme: string;
    description: string;
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
    playStyle: string;
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
    playStyle: string;
    playStyleParams?: string[]; // For suspicious style: contains 2 target player names
    eliminationDay?: number; // Track which day this bot was eliminated (undefined if alive)
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

export const GAME_ROLES = {
    DOCTOR: 'doctor',
    DETECTIVE: 'detective',
    WEREWOLF: 'werewolf',
    VILLAGER: 'villager'
} as const;

export interface RoleConfig {
    name: string;
    hasNightAction: boolean;
    nightActionOrder: number;
    description: string;
    actionType?: 'protect' | 'investigate' | 'eliminate' | 'none';
    alignment: 'good' | 'evil'; // 'good' = villager team, 'evil' = werewolf team
}

export const ROLE_CONFIGS: Record<string, RoleConfig> = {
    [GAME_ROLES.WEREWOLF]: {
        name: 'Werewolf',
        hasNightAction: true,
        nightActionOrder: 1,
        description: 'Can eliminate other players during the night',
        actionType: 'eliminate',
        alignment: 'evil'
    },
    [GAME_ROLES.DOCTOR]: {
        name: 'Doctor',
        hasNightAction: true,
        nightActionOrder: 2,
        description: 'Can protect a player from elimination during the night',
        actionType: 'protect',
        alignment: 'good'
    },
    [GAME_ROLES.DETECTIVE]: {
        name: 'Detective',
        hasNightAction: true,
        nightActionOrder: 3,
        description: 'Can investigate a player to learn their role during the night',
        actionType: 'investigate',
        alignment: 'good'
    }
};

export const PLAY_STYLES = {
    AGGRESSIVE: 'aggressive',
    SUSPICIOUS: 'suspicious', 
    TEAM_PLAYER: 'team_player'
} as const;

export interface PlayStyleConfig {
    name: string;
    description: string;
}

export const PLAY_STYLE_CONFIGS: Record<string, PlayStyleConfig> = {
    [PLAY_STYLES.AGGRESSIVE]: {
        name: 'Aggressive',
        description: 'Constantly accuses other players of being associated with werewolves to see how they react. Believes this is the best way to catch players in lies. If the bot is a werewolf, false accusations help pretend to be a villager.'
    },
    [PLAY_STYLES.SUSPICIOUS]: {
        name: 'Suspicious',
        description: 'Randomly chooses 2 other players and suspects them of being werewolves. The specific target names are selected when the game is created and remain consistent throughout the game.'
    },
    [PLAY_STYLES.TEAM_PLAYER]: {
        name: 'Team Player',
        description: 'Focuses on teaming up with certain players who most likely are not werewolves. Prefers collaboration and building trust over aggressive accusations.'
    }
};

export const GAME_STATES = {
    WELCOME: 'WELCOME',
    DAY_DISCUSSION: 'DAY_DISCUSSION',
    VOTE: 'VOTE',
    VOTE_RESULTS: 'VOTE_RESULTS',
    NIGHT: 'NIGHT',
    NIGHT_ENDS: 'NIGHT_ENDS',
    GAME_OVER: 'GAME_OVER',
} as const;

export enum MessageType {
    GM_COMMAND = 'GM_COMMAND',
    BOT_ANSWER = 'BOT_ANSWER', // Response from a bot to GM command
    GAME_STORY = 'GAME_STORY', // Initial message to generate the game, never used after
    HUMAN_PLAYER_MESSAGE = 'HUMAN_PLAYER_MESSAGE',
    VOTE_MESSAGE = 'VOTE_MESSAGE',
    NIGHT_BEGINS = 'NIGHT_BEGINS', // Special message type for when night phase starts
    SYSTEM_ERROR = 'SYSTEM_ERROR',
    SYSTEM_WARNING = 'SYSTEM_WARNING',
}

export class BotAnswer {
    constructor(public reply: string) {}
}

export class GameStory {
    constructor(public story: string) {}
}

export interface SystemErrorMessage {
    error: string;
    details: string;
    context: Record<string, any>;
    recoverable: boolean;
    timestamp: number;
}

export class BotResponseError extends Error {
    public details: string;
    public context: Record<string, any>;
    public recoverable: boolean;

    constructor(
        message: string,
        details: string = '',
        context: Record<string, any> = {},
        recoverable: boolean = true
    ) {
        super(message);
        this.name = 'BotResponseError';
        this.details = details;
        this.context = context;
        this.recoverable = recoverable;
    }
}

export const MESSAGE_ROLE = {
    SYSTEM: "system" as const,
    USER: "user" as const,
    ASSISTANT: "assistant" as const
} as const;

export const GAME_MASTER = 'Game Master';
export const RECIPIENT_ALL = 'ALL';

export interface GameMessage {
    id: string | null;           // Will be null for new messages, set by Firestore
    recipientName: string;      // Who should receive this message
    authorName: string;         // Who sent this message
    msg: any;                   // The message content
    messageType: string;        // Type of the message (e.g., BOT_ANSWER, GAME_STORY)
    day: number;                // The game day when this message was created
    timestamp: number | null;   // UTC epoch timestamp in milliseconds, null for new messages
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}