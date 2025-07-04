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
    nightResults?: Record<string, { target: string }>; // Dynamic night results for each role that has night actions
}

export const GAME_ROLES = {
    DOCTOR: 'doctor',
    DETECTIVE: 'detective',
    WEREWOLF: 'werewolf',
    VILLAGER: 'villager'
} as const;

export interface RoleConfig {
    name: string;
    nightActionOrder: number;
    description: string;
    alignment: 'good' | 'evil'; // 'good' = villager team, 'evil' = werewolf team
    // UI text for night action modal
    actionTitle?: string;
    targetLabel?: string;
    messageLabel?: string;
    messagePlaceholder?: string;
    submitButtonText?: string;
}

export const ROLE_CONFIGS: Record<string, RoleConfig> = {
    [GAME_ROLES.WEREWOLF]: {
        name: 'Werewolf',
        nightActionOrder: 1,
        description: 'Can eliminate other players during the night',
        alignment: 'evil',
        actionTitle: 'Choose the werewolves target',
        targetLabel: 'Who should be eliminated tonight?',
        messageLabel: 'Message to other werewolves:',
        messagePlaceholder: 'Coordinate with other werewolves...',
        submitButtonText: 'Eliminate Target'
    },
    [GAME_ROLES.DOCTOR]: {
        name: 'Doctor',
        nightActionOrder: 2,
        description: 'Can protect a player from elimination during the night',
        alignment: 'good',
        actionTitle: 'Choose who to protect',
        targetLabel: 'Who do you want to protect tonight?',
        messageLabel: 'Message to other doctors:',
        messagePlaceholder: 'Share your thoughts...',
        submitButtonText: 'Protect Target'
    },
    [GAME_ROLES.DETECTIVE]: {
        name: 'Detective',
        nightActionOrder: 3,
        description: 'Can investigate a player to learn their role during the night',
        alignment: 'good',
        actionTitle: 'Choose who to investigate',
        targetLabel: 'Who do you want to investigate tonight?',
        messageLabel: 'Message to other detectives:',
        messagePlaceholder: 'Share your thoughts...',
        submitButtonText: 'Investigate Target'
    }
};

export const PLAY_STYLES = {
    AGGRESSIVE_PROVOKER: 'aggressive_provoker',
    PROTECTIVE_TEAM_PLAYER: 'protective_team_player', 
    TRICKSTER: 'trickster'
} as const;

export interface PlayStyleConfig {
    name: string;
    description: string;
    werewolfDescription: string;
}

export const PLAY_STYLE_CONFIGS: Record<string, PlayStyleConfig> = {
    [PLAY_STYLES.AGGRESSIVE_PROVOKER]: {
        name: 'Aggressive Provoker',
        description: `
You boldly attack other players by accusing them of being werewolves. You falsely accuse them not because you are evil but because you are smart. \
You provoke them to see their reaction, as it's hard for most players to lie under pressure. Your goal is to exploit this by creating pressure and seeing how they respond. \
You know that this aggressive strategy during day discussion works and helps your team win eventually.
`,
        werewolfDescription: `
As a werewolf, your aggressive provoking nature serves you perfectly. Attack other players by boldly accusing them of being werewolves - this creates chaos and suspicion among villagers. \
Be ruthless in your accusations to deflect attention from yourself. Your aggression will be seen as passionate village defense, not werewolf behavior. \
Provoke reactions from others to make them look suspicious. Create conflict and division among the villagers - the more they fight each other, the easier it is for your team to win.
`
    },
    [PLAY_STYLES.PROTECTIVE_TEAM_PLAYER]: {
        name: 'Protective Team Player',
        description: `
You seek to form alliances with other players and share information, as there are more good players than werewolves. \
You are suspicious about other alliances forming, as they might be werewolf coordination. You actively protect players who are being bullied or ganged up on, \
as this seems unfair and potentially orchestrated by werewolves trying to eliminate innocents. You believe in fairness and standing up for the underdog.
`,
        werewolfDescription: `
As a werewolf, being protective and supportive of others is your perfect strategy to earn trust and appear innocent. \
When players are being bullied or attacked by multiple others, step in to defend them - this makes you look like a caring, fair-minded villager. \
Your protective nature will make others see you as trustworthy and someone who stands up for the innocent. Be suspicious of other alliances while forming your own. \
Use this goodwill to subtly guide discussions away from suspecting you and toward other targets. People remember who protected them, and this loyalty will shield you when suspicions arise.
`
    },
    [PLAY_STYLES.TRICKSTER]: {
        name: 'Trickster',
        description: `
You thrive on creating chaos and confusion during discussions. You deliberately change sides and allegiances to keep everyone guessing about your true intentions. \
Your goal is to make the game unpredictable and force others to reveal their true nature through the chaos you create. You believe that in the confusion, \
the werewolves will make mistakes and expose themselves, while you remain adaptable and hard to pin down.
`,
        werewolfDescription: `
As a werewolf, your trickster nature is your greatest asset. Create chaos and constantly change sides to confuse the villagers and make them distrust each other. \
Your unpredictable behavior will be seen as eccentric village behavior rather than werewolf tactics. Use the confusion you create to deflect suspicion from yourself. \
By constantly shifting allegiances and creating disorder, you make it impossible for villagers to form stable alliances against you. \
The more chaotic the game becomes, the easier it is for your werewolf team to pick off confused and isolated villagers.
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
    WEREWOLF_ACTION = 'WEREWOLF_ACTION', // Werewolf night action response
    DOCTOR_ACTION = 'DOCTOR_ACTION', // Doctor night action response
    DETECTIVE_ACTION = 'DETECTIVE_ACTION', // Detective night action response
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

export class WerewolfAction {
    constructor(public target: string, public reasoning: string) {}
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
export const RECIPIENT_WEREWOLVES = 'WEREWOLVES';
export const RECIPIENT_DOCTOR = 'DOCTOR';
export const RECIPIENT_DETECTIVE = 'DETECTIVE';

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