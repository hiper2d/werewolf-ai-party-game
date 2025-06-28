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
    errorState?: SystemErrorMessage | null; // Persistent error state stored in the game object
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
    werewolfDescription: string;
}

export const PLAY_STYLE_CONFIGS: Record<string, PlayStyleConfig> = {
    [PLAY_STYLES.AGGRESSIVE]: {
        name: 'Aggressive',
        description: `
Your core strategy is to attack other players by accusing them in being werewolves. You do this so see how they react. \
It's hard for most of the players to lie, and your goal is to exploit this. You falsely accuse them not because you are evil but because you are smart. \
You know that this strategy and extra aggression during day discussion works and it will help your team to win eventually.
`,
        werewolfDescription: `
As a werewolf, your aggressive nature serves you perfectly. Attack other players by accusing them of being werewolves - this creates chaos and suspicion among villagers. \
Be ruthless in your accusations to deflect attention from yourself. Your aggression will be seen as passionate village defense, not werewolf behavior. \
Create conflict and division among the villagers - the more they fight each other, the easier it is for your team to win.
`
    },
    [PLAY_STYLES.SUSPICIOUS]: {
        name: 'Suspicious',
        description: `
You have few players you especially suspect for being werewolves. Something in their behavior point to that. \
One of your goals in this game to convince everybody else that they are werewolves during day discussions. \
`,
        werewolfDescription: `
As a werewolf, your suspicious nature is your greatest weapon. Point fingers at innocent players and build compelling cases against them. \
Your suspicions will seem genuine and well-reasoned, making villagers trust your judgment. Focus on creating doubt about specific players - \
the more convinced you appear, the more likely others will follow your lead and eliminate innocent villagers.
`
    },
    [PLAY_STYLES.TEAM_PLAYER]: {
        name: 'Team Player',
        description: `
You want to team up with other players and share the information. \
There are more good players than werewolves, thus teaming up is the key. You don't like aggressive players and liars, \
this play-style is suspicious to you and seems like a werewolf style. \
When you see a player being attacked or accused by multiple others, you tend to defend them to maintain balance and fairness, \
as ganging up on someone seems unfair and potentially orchestrated by werewolves trying to eliminate innocents.
`,
        werewolfDescription: `
As a werewolf, being supportive and defensive of others is your perfect strategy to earn trust and appear innocent. \
When players are being attacked by multiple others, step in to defend them - this makes you look like a caring, fair-minded villager. \
Your supportive nature will make others see you as trustworthy and someone who stands up for the innocent. \
Use this goodwill to subtly guide discussions away from suspecting you and toward other targets. \
People remember who defended them, and this loyalty will protect you when suspicions arise.
`
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