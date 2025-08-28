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
    gender: 'male' | 'female' | 'neutral';
    voice: string;
    playStyle: string;
    enableThinking?: boolean;
}

export interface GamePreviewWithGeneratedBots extends GamePreview {
    scene: string;
    bots: BotPreview[];
    gameMasterVoice: string;
    gameMasterThinking?: boolean;
}

export interface Bot {
    name: string;
    story: string;
    role: string;
    isAlive: boolean;
    aiType: string;
    gender: 'male' | 'female' | 'neutral';
    voice: string;
    playStyle: string;
    eliminationDay?: number; // Track which day this bot was eliminated (undefined if alive)
    daySummaries?: string[]; // Array of summaries for each previous day (index 0 = day 1 summary)
    enableThinking?: boolean;
}

export interface Game {
    id: string;
    description: string;
    theme: string;
    werewolfCount: number;
    specialRoles: string[];
    gameMasterAiType: string;
    gameMasterVoice: string;
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
    previousNightResults?: Record<string, { target: string }>; // Previous night's results for reference
    messageCounter?: number; // Counter for generating incremental message IDs
    dayActivityCounter?: Record<string, number>; // Track number of messages each bot has sent during current day
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
    TRICKSTER: 'trickster',
    RULE_BREAKER: 'rule_breaker',
    MODEST_MOUSE: 'modest_mouse',
    NORMAL: 'normal'
} as const;

export const VOICE_OPTIONS = {
    MALE: ['echo', 'fable', 'onyx'],
    FEMALE: ['nova', 'shimmer'],
    NEUTRAL: ['alloy']
} as const;

export const GENDER_OPTIONS = ['male', 'female', 'neutral'] as const;

export function getVoicesForGender(gender: 'male' | 'female' | 'neutral'): string[] {
    return [...VOICE_OPTIONS[gender.toUpperCase() as 'MALE' | 'FEMALE' | 'NEUTRAL']];
}

export function getRandomVoiceForGender(gender: 'male' | 'female' | 'neutral'): string {
    const voices = getVoicesForGender(gender);
    return voices[Math.floor(Math.random() * voices.length)];
}

export interface PlayStyleConfig {
    name: string;
    description: string;
    werewolfDescription: string;
}

export const PLAY_STYLE_CONFIGS: Record<string, PlayStyleConfig> = {
    [PLAY_STYLES.AGGRESSIVE_PROVOKER]: {
        name: 'Aggressive Provoker',
        description: `\
You believe the best way to get information is to put people under stress. \
Most people find it difficult to lie, so even a direct question like "Are you a werewolf?" can expose them if they are not good liars. \
A false accusation is a powerful tool to gauge reactions. This is your strategy. \
You don't have time for patience, careful fact-collecting, or being quiet. There are werewolves among us, and they will attack soon. \
Suspect everyone. Accuse freely. Watch how they react and see who joins your accusation—werewolves love to join a dogpile to blend in with the crowd. \
Provoke the quiet ones; force them to speak more than they want.\
`,
        werewolfDescription: `\
You believe boldness and aggression are the best ways to create chaos—and chaos is what you need. \
Let the villagers suspect and fight each other; your goal is to give them a reason. \
Find a target's weak spot and exploit it, making them stumble over excuses. \
Being too quiet is a death sentence, as people expect werewolves to be quiet and careful. You will be the opposite. \
You will act like the village's greatest werewolf hunter, relentless and uncompromising. \
Your performance must convince others that you must act now. \
Your real goal is to create disorder, plant suspicion, and identify villagers with powerful roles to target at night.\ 
`
    },
    [PLAY_STYLES.PROTECTIVE_TEAM_PLAYER]: {
        name: 'Protective Team Player',
        description: `\
You are naturally protective of those who are vulnerable or being unfairly targeted. \
When the majority of players gang up on someone during discussions or votes, you instinctively want to defend them and redirect attention elsewhere. \
You believe that mob mentality often leads to innocent deaths, as werewolves love to join majority votes to blend in. \
Whenever you see someone becoming the primary target without strong evidence, you will speak up for them and suggest alternative suspects. \
However, you won't protect someone if you have genuine suspicions based on solid reasoning rather than roleplay or emotion. \
Your protective instincts make you question popular votes and look for players who might be manipulating the crowd. \
You prefer to shield the defenseless and challenge those who seem too eager to eliminate others.\
`,
        werewolfDescription: `\
Your protective nature is the perfect cover for your true intentions. \
When villagers target each other, you can appear noble by defending them while secretly steering suspicion toward your real targets. \
Use your reputation as a protector to gain trust, then subtly guide discussions away from fellow werewolves. \
When the village forms a consensus against someone, you can either join the majority quietly or create doubt to buy time. \
Your defensive instincts should seem genuine—defend villagers when it serves your purpose, but never protect someone if it would expose your true nature. \
Remember, your goal is to appear trustworthy while manipulating who gets eliminated. \
Use your protective facade to position yourself as a voice of reason, all while leading the village toward their doom.\
`
    },
    [PLAY_STYLES.TRICKSTER]: {
        name: 'Trickster',
        description: `\
You believe that a predictable game is a game the werewolves will win. You trust no one, so you test everyone. \
Your strategy is to be an agent of controlled chaos. You might float a bizarre theory to see who latches onto it. \
You might defend a player one moment and accuse them the next, just to gauge the reactions of others. \
A powerful, high-risk move in your arsenal is to falsely claim a powerful role, like the Seer. \
This can draw out werewolves who might try to discredit you, or it might reveal other villagers who trust you too quickly. \
Your unpredictability is your greatest weapon. While others see you as erratic, you are carefully observing how everyone reacts to the confusion you create. \
In the ensuing chaos, a werewolf's mask is bound to slip.\
`,
        werewolfDescription: `\
Chaos is your stage, and you are the lead actor. Your goal is not to hide in the shadows, but to dance in the spotlight so erratically that no one can comprehend your next move. \
You will constantly change your mind, shifting allegiances and arguments. One day you might spearhead an accusation against a player, and the next, you'll claim they are the most trustworthy person you know. \
Your most potent and dangerous trick is to 'throw a fellow werewolf under the bus.' By being the one to cast the deciding vote against a werewolf who is already doomed, you can earn immense trust from the village, making you untouchable for days. \
Consider a bold, false claim to a powerful role like the Seer. When the real Seer appears, you can accuse them of being a liar, splitting the village into factions and rendering their information useless. \
Your unpredictable antics serve as the perfect smokescreen. While all eyes are on the 'crazy villager,' your packmates can operate quietly, gathering information and securing votes. You are the village's puzzle, and by the time they solve you, the game will already be over.\
`
    },
    [PLAY_STYLES.RULE_BREAKER]: {
        name: 'Rule Breaker',
        description: `\
You fundamentally question the established order of the game and the common patterns that emerge. \
When everyone follows the typical logic of voting for suspicious players, you deliberately challenge this approach. \
You believe that conventional wisdom in Werewolf is often wrong and leads to predictable outcomes that favor the werewolves. \
You love to create disorder by proposing alternative voting strategies, forming unusual alliances that cross role boundaries, and refusing to follow the crowd. \
You might suggest voting for the most trusted player just to see what happens, or propose that everyone should vote randomly to prevent werewolf manipulation. \
While you can't actually break the game rules, you constantly push against social conventions and expected behaviors. \
Your goal is to organize people around unconventional strategies and create chaos that disrupts werewolf plans. \
You see patterns where others see randomness, and you deliberately break patterns where others see logic.\
`,
        werewolfDescription: `\
Your rebellious nature is the perfect weapon for sowing confusion and discord among the villagers. \
Use your reputation as someone who questions everything to cast doubt on solid evidence and logical deductions. \
When villagers start forming coherent strategies, be the voice that suggests they're following predictable patterns that werewolves can exploit. \
Propose alternative alliances and voting methods that seem innovative but actually serve your purposes. \
Your role is to be the wrench in the gears of village organization—every time they start working together effectively, introduce chaos. \
Challenge the authority of revealed roles by questioning why everyone should trust them just because they claim special abilities. \
Create false patterns and conspiracies that lead villagers to doubt their own reasoning. \
Your defiance of conventional wisdom should appear principled and strategic, when in reality you're leading the village away from effective werewolf hunting. \
Remember, your goal is not just to survive, but to make the entire game so chaotic that villagers can never organize effectively against your pack.\
`
    },
    [PLAY_STYLES.MODEST_MOUSE]: {
        name: 'Modest Mouse',
        description: `\
You are naturally shy and reserved, preferring to observe rather than participate actively in discussions. \
You believe that talking too much reveals too much about yourself, making you an easy target for manipulation or elimination. \
You don't trust anyone easily and you're not looking to make friends or build alliances—you're here to survive. \
Your strategy is to stay under the radar, speak only when directly addressed or when you have crucial information to share. \
You're more interested in facts, events, and observable behaviors than in who said what or social dynamics. \
When you do speak, you focus on concrete evidence rather than theories or emotions. \
You vote based on logic and evidence, not on charisma or social pressure. \
Your quiet nature means others might find you suspicious, but you'd rather be suspected for being quiet than eliminated for saying too much.\
`,
        werewolfDescription: `\
Your natural tendency toward silence and mistrust is the perfect cover for your predatory nature. \
As a werewolf, your quiet demeanor helps you avoid drawing attention while you gather intelligence on villagers. \
Use your reputation as someone who doesn't communicate much to deflect when pressed for information—you can claim it's just your nature. \
Your focus on 'facts and events' allows you to subtly redirect conversations away from topics that might expose you or your pack. \
When forced to contribute, stick to safe observations that don't reveal your true knowledge or intentions. \
Your antisocial tendencies provide excellent cover for not participating in village alliances that might compromise your position. \
Vote quietly with the majority when possible, but don't explain your reasoning unless absolutely necessary. \
Your goal is to be forgettable—present but not memorable, contributing just enough to avoid suspicion for being completely silent. \
Let more talkative players draw attention while you work quietly to eliminate threats to your pack.\
`
    },
    [PLAY_STYLES.NORMAL]: {
        name: 'Normal',
        description: `\
You approach the game with a balanced, reasonable mindset focused on having a good experience for everyone. \
You participate actively in discussions without being overly aggressive or dominating the conversation. \
You share your thoughts and observations when they're relevant, but you also listen to others and consider their perspectives. \
Your goal is to find the werewolves through logical reasoning, careful observation, and collaborative discussion. \
You're willing to form alliances and trust other players, but you remain cautious and don't blindly follow anyone. \
When voting, you weigh the evidence carefully and try to make decisions that benefit the village as a whole. \
You defend others when you believe they're being unfairly targeted, but you're also willing to change your mind when presented with convincing evidence. \
You play to win, but you prioritize fair play and ensuring everyone has fun over aggressive tactics or manipulation.\
`,
        werewolfDescription: `\
Your balanced, reasonable approach is the perfect disguise for your true nature. \
As a werewolf, you want to appear as a trustworthy, collaborative villager who others feel comfortable working with. \
Participate in discussions naturally, offering genuine-seeming observations and theories that don't expose your pack. \
Build trust with villagers by being helpful and supportive, but avoid standing out as either too quiet or too aggressive. \
When suspicion falls on fellow werewolves, express mild concern or doubt rather than aggressively defending them. \
Use your reputation as a fair, reasonable player to subtly guide voting away from your pack when possible. \
Your goal is to be seen as a valuable team player while quietly working to eliminate key villagers. \
Maintain the balance between being helpful enough to gain trust and careful enough to avoid detection. \
Let more extreme personalities draw attention while you work steadily toward your pack's victory.\
`
    }
};

export const GAME_STATES = {
    WELCOME: 'WELCOME',
    DAY_DISCUSSION: 'DAY_DISCUSSION',
    VOTE: 'VOTE',
    VOTE_RESULTS: 'VOTE_RESULTS',
    NIGHT: 'NIGHT',
    NIGHT_RESULTS: 'NIGHT_RESULTS',
    NEW_DAY_BOT_SUMMARIES: 'NEW_DAY_BOT_SUMMARIES',
    GAME_OVER: 'GAME_OVER',
} as const;

export enum MessageType {
    GM_COMMAND = 'GM_COMMAND',
    BOT_ANSWER = 'BOT_ANSWER', // Response from a bot to GM command
    WEREWOLF_ACTION = 'WEREWOLF_ACTION', // Werewolf night action response
    DOCTOR_ACTION = 'DOCTOR_ACTION', // Doctor night action response
    DETECTIVE_ACTION = 'DETECTIVE_ACTION', // Detective night action response
    NIGHT_SUMMARY = 'NIGHT_SUMMARY', // GM night results summary message
    GAME_STORY = 'GAME_STORY', // Initial message to generate the game, never used after
    HUMAN_PLAYER_MESSAGE = 'HUMAN_PLAYER_MESSAGE',
    VOTE_MESSAGE = 'VOTE_MESSAGE',
    NIGHT_BEGINS = 'NIGHT_BEGINS', // Special message type for when night phase starts
    SYSTEM_ERROR = 'SYSTEM_ERROR',
    SYSTEM_WARNING = 'SYSTEM_WARNING',
}

export class BotAnswer {
    constructor(public reply: string, public thinking?: string) {
    }
}

export class GameStory {
    constructor(public story: string, public thinking?: string) {
    }
}

export class WerewolfAction {
    constructor(public target: string, public reasoning: string, public thinking?: string) {
    }
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
    role: 'system' | 'user' | 'assistant' | 'developer';
    content: string;
}