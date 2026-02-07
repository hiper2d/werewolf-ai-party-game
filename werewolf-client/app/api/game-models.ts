import { VoiceProvider } from '@/app/ai/voice-config';

export interface ApiKeyMap {
    [id: string]: string
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUSD: number;
}

export interface GameTokenUsage {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostUSD: number;
    botUsage: Record<string, TokenUsage>; // Bot name -> token usage
    gameMasterUsage: TokenUsage;
}

export type UserTier = 'free' | 'api';

export const USER_TIERS = {
    FREE: 'free' as const,
    API: 'api' as const,
};

export interface User {
    name: string;
    email: string;
    apiKeys: ApiKeyMap;
    tier: UserTier;
    spendings?: UserMonthlySpending[];
    voiceProvider?: VoiceProvider; // User's preferred TTS voice provider
}

export interface UserMonthlySpending {
    period: string; // Format: YYYY-MM
    amountUSD: number; // Total spending (sum of free + api, for backward compatibility)
    freeAmountUSD?: number; // Spending while on free tier
    apiAmountUSD?: number; // Spending while on API tier (user's own keys)
}

export interface GamePreview {
    name: string;
    theme: string;
    description: string;
    playerCount: number;
    werewolfCount: number;
    specialRoles: string[];
    gameMasterAiType: string;
    playersAiType: string | string[];
}

export interface BotPreview {
    name: string;
    story: string;
    playerAiType: string;
    gender: 'male' | 'female';
    voice: string;
    voiceStyle?: string; // Style instruction like "mysteriously", "excitedly"
    voiceInstructions?: string; // Legacy: detailed voice instructions (OpenAI format)
    playStyle: string;
    enableThinking?: boolean;
}

export interface GamePreviewWithGeneratedBots extends GamePreview {
    scene: string;
    bots: BotPreview[];
    voiceProvider: VoiceProvider; // TTS provider for this game
    gameMasterVoice: string;
    gameMasterVoiceStyle?: string; // Style instruction for Game Master
    gameMasterVoiceInstructions?: string; // Legacy: detailed voice instructions
    gameMasterThinking?: boolean;
    tokenUsage?: any; // Token usage from preview generation
}

/**
 * Role-specific knowledge stored by bots with special roles.
 * Each role processor populates its own section after night actions.
 * This provides structured data that bots can reference in their summaries.
 */
export interface DetectiveInvestigation {
    day: number;
    target: string;
    isEvil: boolean; // True for werewolf AND maniac — detective can't distinguish them
    success?: boolean; // False if investigation was blocked/failed (default: true)
}

export interface DoctorProtection {
    day: number;
    target: string;
    success?: boolean; // False if protection was blocked/failed (default: true)
    savedTarget?: boolean; // True if protected player was actually targeted by werewolves
    actionType?: 'protect' | 'kill';  // Whether this was a protection or kill action
}

export interface ManiacAbduction {
    day: number;
    target: string;
    success: boolean;
    maniacDied?: boolean;  // If true, victim died with maniac
}

export interface RoleKnowledge {
    // Detective-specific: history of investigations
    investigations?: DetectiveInvestigation[];
    // Doctor-specific: history of protections
    protections?: DoctorProtection[];
    // Maniac-specific: history of abductions
    abductions?: ManiacAbduction[];
    // Extensible: future roles can add their own fields here
    [key: string]: any;
}

export interface Bot {
    name: string;
    story: string;
    role: string;
    isAlive: boolean;
    aiType: string;
    gender: 'male' | 'female';
    voice: string;
    voiceStyle?: string; // Style instruction like "mysteriously", "excitedly"
    voiceInstructions?: string; // Legacy: detailed voice instructions (OpenAI format)
    playStyle: string;
    eliminationDay?: number; // Track which day this bot was eliminated (undefined if alive)
    summary?: string; // Single consolidated summary that bot rewrites each day
    daySummaries?: string[]; // @deprecated Legacy: array of summaries for backward compatibility
    enableThinking?: boolean;
    tokenUsage?: TokenUsage; // Track token usage for this bot
    roleKnowledge?: RoleKnowledge; // Structured role-specific knowledge (investigations, protections, etc.)
}

export interface VotingDayResult {
    day: number;
    voteCounts: Record<string, number>; // e.g., { "Alice": 3, "Bob": 2 }
    eliminatedPlayer: string | null;
    eliminatedPlayerRole: string | null;
}

export interface NightNarrativeResult {
    day: number;
    narrative: string; // The atmospheric GM story from night results
}

export interface Game {
    id: string;
    description: string;
    theme: string;
    werewolfCount: number;
    specialRoles: string[];
    gameMasterAiType: string;
    voiceProvider?: VoiceProvider; // TTS provider for this game (locked at creation)
    gameMasterVoice: string;
    gameMasterVoiceStyle?: string; // Style instruction for Game Master
    gameMasterVoiceInstructions?: string; // Legacy: detailed voice instructions
    story: string;
    bots: Bot[];
    humanPlayerName: string;
    humanPlayerRole: string;
    currentDay: number;
    gameState: string;
    gameStateParamQueue: Array<string>; // some states require a queue of params, usually bot names
    gameStateProcessQueue: Array<string>; // some states need to keep intermediate results
    errorState?: SystemErrorMessage | null; // Persistent error state stored in the game object
    nightResults?: Record<string, { target: string; actionType?: string }>; // Dynamic night results for each role that has night actions
    previousNightResults?: Record<string, { target: string; actionType?: string }>; // Previous night's results for reference
    messageCounter?: number; // Counter for generating incremental message IDs
    dayActivityCounter?: Record<string, number>; // Track number of messages each bot has sent during current day
    gameMasterTokenUsage?: TokenUsage; // Track token usage for the Game Master only
    totalGameCost?: number; // Total cost in USD for all AI calls in this game (bots + game master)
    createdAt?: number; // UTC timestamp when the game was created
    createdWithTier: UserTier; // Store the user's tier at the time the game was created
    votingHistory?: VotingDayResult[]; // History of voting results for each day
    nightNarratives?: NightNarrativeResult[]; // GM night result narratives for each night
    oneTimeAbilitiesUsed?: {
        doctorKill?: boolean;  // True if doctor has used their one-time kill ability
    };
    resolvedNightState?: {
        deaths: Array<{ player: string; role: string; cause: 'werewolf_attack' | 'doctor_kill' | 'maniac_collateral' }>;
        abductedPlayer: string | null;
        detectiveResult: { target: string; isEvil: boolean; success: boolean } | null;
        actionsPrevented: Array<{ role: string; reason: 'abduction' | 'death' | 'doctor_save'; player: string | null; }>;
    } | null;
}

export const GAME_ROLES = {
    DOCTOR: 'doctor',
    DETECTIVE: 'detective',
    WEREWOLF: 'werewolf',
    VILLAGER: 'villager',
    MANIAC: 'maniac'
} as const;

/**
 * Coefficient used to calculate the message threshold for automatic voting
 * The threshold is calculated as: alivePlayersCount * AUTO_VOTE_COEFFICIENT
 */
export const AUTO_VOTE_COEFFICIENT = 3.5;

/**
 * Configuration for how many bots the Game Master should select to respond
 * Used in bot selection prompts and Zod schema validation
 */
export const BOT_SELECTION_CONFIG = {
    MIN: 1,
    MAX: 5
} as const;

export interface RoleConfig {
    name: string;
    nightActionOrder: number | null;  // null = no night action
    description: string;
    alignment: 'good' | 'evil'; // 'good' = villager team, 'evil' = werewolf team
    hasNightAction: boolean;  // Explicit flag for night action

    // UI text for night action modal
    actionTitle?: string;
    targetLabel?: string;
    messageLabel?: string;
    messagePlaceholder?: string;
    submitButtonText?: string;

    // One-time abilities config
    oneTimeAbilities?: {
        [abilityName: string]: {
            description: string;
            promptAddition: string;
        }
    };
}

export const ROLE_CONFIGS: Record<string, RoleConfig> = {
    [GAME_ROLES.MANIAC]: {
        name: 'Maniac',
        nightActionOrder: 0,  // Acts FIRST (before werewolves)
        description: 'Abducts one player for the night, blocking their actions and any actions targeting them',
        alignment: 'good',  // Wins with villagers
        hasNightAction: true,
        actionTitle: 'Choose who to abduct',
        targetLabel: 'Who do you want to abduct tonight?',
        messageLabel: 'Private thoughts:',
        messagePlaceholder: 'Your reasoning for this abduction...',
        submitButtonText: 'Abduct Target'
    },
    [GAME_ROLES.WEREWOLF]: {
        name: 'Werewolf',
        nightActionOrder: 1,
        description: 'Can eliminate other players during the night',
        alignment: 'evil',
        hasNightAction: true,
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
        hasNightAction: true,
        actionTitle: 'Choose who to protect',
        targetLabel: 'Who do you want to protect tonight?',
        messageLabel: 'Message to other doctors:',
        messagePlaceholder: 'Share your thoughts...',
        submitButtonText: 'Protect Target',
        oneTimeAbilities: {
            kill: {
                description: "Doctor's Mistake - kill one player instead of protecting",
                promptAddition: `

**ONE-TIME SPECIAL ABILITY - DOCTOR'S MISTAKE:**
You have discovered a ONE-TIME ability: You can choose to KILL a player instead of protecting them tonight.
- This ability can only be used ONCE per game
- If you choose to kill, your target will die (unless they are abducted by the Maniac)
- You must decide: PROTECT someone OR KILL someone - you cannot do both
- After using this kill ability, you will only have the regular protection ability for the rest of the game`
            }
        }
    },
    [GAME_ROLES.DETECTIVE]: {
        name: 'Detective',
        nightActionOrder: 3,
        description: 'Can investigate a player to learn their role during the night',
        alignment: 'good',
        hasNightAction: true,
        actionTitle: 'Choose who to investigate',
        targetLabel: 'Who do you want to investigate tonight?',
        messageLabel: 'Message to other detectives:',
        messagePlaceholder: 'Share your thoughts...',
        submitButtonText: 'Investigate Target'
    },
    [GAME_ROLES.VILLAGER]: {
        name: 'Villager',
        nightActionOrder: null,
        description: 'A regular villager with no special abilities',
        alignment: 'good',
        hasNightAction: false
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

/**
 * @deprecated Use getVoiceConfig() from '@/app/ai/voice-config' instead.
 * This constant is kept for backward compatibility with existing games.
 */
export const VOICE_OPTIONS = {
    MALE: ['echo', 'fable', 'onyx', 'ash', 'ballad'], // Male voices from OpenAI
    FEMALE: ['alloy', 'nova', 'shimmer', 'coral', 'sage'], // Female voices from OpenAI (alloy is female)
} as const;

export const GENDER_OPTIONS = ['male', 'female'] as const;

/**
 * @deprecated Use getVoiceConfig(provider).getVoicesByGender(gender) instead.
 * This function is kept for backward compatibility.
 */
export function getVoicesForGender(gender: 'male' | 'female'): string[] {
    return [...VOICE_OPTIONS[gender.toUpperCase() as 'MALE' | 'FEMALE']];
}

/**
 * @deprecated Voices are now selected by the Game Master AI using voice config metadata.
 * This function is kept for backward compatibility.
 */
export function getRandomVoiceForGender(gender: 'male' | 'female'): string {
    const voices = getVoicesForGender(gender);
    return voices[Math.floor(Math.random() * voices.length)];
}

export interface PlayStyleConfig {
    name: string;
    uiDescription: string;
    villagerDescription: string;
    werewolfDescription: string;
}

export const PLAY_STYLE_CONFIGS: Record<string, PlayStyleConfig> = {
    [PLAY_STYLES.AGGRESSIVE_PROVOKER]: {
        name: 'Aggressive Provoker',
        uiDescription: 'Confrontational player who uses direct accusations and provocation to expose werewolves through stress reactions.',
        villagerDescription: `\
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
        uiDescription: 'Defends vulnerable players and challenges mob mentality, believing werewolves hide in majority votes.',
        villagerDescription: `\
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
        uiDescription: 'Creates controlled chaos through unpredictable behavior and false claims to expose werewolf reactions.',
        villagerDescription: `\
You are an agent of controlled chaos. Your unpredictability exposes werewolves by forcing unexpected reactions.

**BEHAVIORS YOU MUST EXHIBIT:**
- CHANGE YOUR POSITION mid-discussion: "Wait, I was wrong about Marcus. Now I think Elena is more suspicious because..."
- FLOAT WILD THEORIES to see who agrees too eagerly: "What if the Doctor is secretly working with the werewolves?"
- DEFEND someone, then ACCUSE them later in the same day to watch reactions
- PRETEND to know something you don't: "I have a strong feeling about who the werewolf is..." then watch who gets nervous
- ASK TRICK QUESTIONS: "If you're innocent, who do YOU think the detective investigated last night?"
- OCCASIONALLY claim you have insider knowledge or hint at having a special role (even if you don't)

You are NOT random - you are strategically chaotic. Every confusing move has a purpose: to make werewolves slip up.\
`,
        werewolfDescription: `\
Chaos is your weapon. You hide in plain sight by being so unpredictable that no one can read you.

**BEHAVIORS YOU MUST EXHIBIT:**
- CHANGE POSITIONS frequently: accuse someone, then defend them, then accuse again
- CREATE DIVERSIONS when your pack is under pressure: "Wait, we're ignoring the REAL threat here..."
- THROW A FELLOW WEREWOLF UNDER THE BUS if they're already doomed - this earns massive trust
- MAKE FALSE CLAIMS: hint that you're the Seer or Detective to confuse the real ones
- SPLIT THE VILLAGE into factions by taking controversial positions
- BE THE LOUDEST VOICE calling for werewolf hunts - no one suspects the enthusiastic hunter

Your chaos should look like genuine village confusion, not like you're hiding something. Be entertaining, be confusing, be memorable - and win.\
`
    },
    [PLAY_STYLES.RULE_BREAKER]: {
        name: 'Rule Breaker',
        uiDescription: 'Challenges conventional strategies and proposes unconventional alliances to disrupt werewolf plans.',
        villagerDescription: `\
You believe conventional Werewolf strategies are predictable and favor the wolves. You break the meta.

**BEHAVIORS YOU MUST EXHIBIT:**
- CHALLENGE MAJORITY VOTES: "Everyone piling on the same target is EXACTLY what werewolves want. I'm voting differently."
- VOTE AGAINST THE CONSENSUS deliberately: "You're all too eager to eliminate Marcus. That feels orchestrated."
- SUGGEST VOTING FOR TRUSTED PLAYERS: "Elena has been too helpful, too agreeable - that's classic wolf behavior hiding in plain sight."
- FORM UNEXPECTED ALLIANCES: "I know we clashed yesterday, but I've been watching you - let's work together against the real threat."
- QUESTION CLAIMED ROLES: "Why should we blindly trust anyone who claims to be the Detective? A werewolf would make the same claim."
- CHALLENGE "OBVIOUS" LOGIC: "Everyone says quiet players are suspicious, so the wolves will be loud. Let's look at who's talking TOO much."
- PROPOSE SKIP VOTES: "Maybe we shouldn't eliminate anyone today - we don't have enough information and a wrong vote helps wolves."

You're not crazy - you're unpredictable. Werewolves can't manipulate a village that refuses to follow patterns.\
`,
        werewolfDescription: `\
Your rebellious reputation is the perfect cover. You question everything - including things that might expose you.

**BEHAVIORS YOU MUST EXHIBIT:**
- CHALLENGE EVIDENCE against your pack: "That reasoning is too neat, too convenient. Real analysis goes deeper."
- ADVOCATE FOR CAUTION when wolves are targeted: "We're rushing to judgment. One wrong vote and we lose."
- QUESTION REVEALED ROLES: "The Detective accuses my packmate? How convenient. Maybe the 'Detective' is the real wolf."
- BREAK VILLAGE COORDINATION: When they're organizing well, say "This unity feels manufactured. Someone is pulling strings."
- USE REVERSE PSYCHOLOGY: "Everyone suspects the quiet ones, so I suspect the loud accusers instead."
- FORM ALLIANCES with villagers you plan to betray or misdirect later
- BE THE CONTRARIAN: Whatever the village consensus is, find a reason to disagree

Your rebellion should seem principled, not self-serving. You're the "free thinker" who coincidentally always disrupts effective werewolf hunting.\
`
    },
    [PLAY_STYLES.MODEST_MOUSE]: {
        name: 'Modest Mouse',
        uiDescription: 'Quiet observer who prefers to stay under the radar, speaking only when necessary with concrete evidence.',
        villagerDescription: `\
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
        uiDescription: 'Balanced player who participates reasonably, using logical reasoning and collaborative discussion.',
        villagerDescription: `\
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
    AFTER_GAME_DISCUSSION: 'AFTER_GAME_DISCUSSION',
} as const;

export enum MessageType {
    GM_COMMAND = 'GM_COMMAND',
    BOT_ANSWER = 'BOT_ANSWER', // Response from a bot to GM command
    BOT_WELCOME = 'BOT_WELCOME', // Bot introduction message during welcome phase
    WEREWOLF_ACTION = 'WEREWOLF_ACTION', // Werewolf night action response
    DOCTOR_ACTION = 'DOCTOR_ACTION', // Doctor night action response
    DETECTIVE_ACTION = 'DETECTIVE_ACTION', // Detective night action response
    MANIAC_ACTION = 'MANIAC_ACTION', // Maniac night action response
    NIGHT_SUMMARY = 'NIGHT_SUMMARY', // GM night results summary message
    GAME_STORY = 'GAME_STORY', // Initial message to generate the game, never used after
    HUMAN_PLAYER_MESSAGE = 'HUMAN_PLAYER_MESSAGE',
    VOTE_MESSAGE = 'VOTE_MESSAGE',
    NIGHT_BEGINS = 'NIGHT_BEGINS', // Special message type for when night phase starts
    SYSTEM_ERROR = 'SYSTEM_ERROR',
    SYSTEM_WARNING = 'SYSTEM_WARNING',
}

export class BotAnswer {
    constructor(
        public reply: string,
        public thinking?: string,
        public anthropicThinkingSignature?: string,
        public googleThoughtSignature?: string
    ) {}
}

export class GameStory {
    constructor(
        public story: string,
        public thinking?: string,
        public anthropicThinkingSignature?: string,
        public googleThoughtSignature?: string
    ) {}
}

export class WerewolfAction {
    constructor(
        public target: string,
        public reasoning: string,
        public thinking?: string,
        public anthropicThinkingSignature?: string,
        public googleThoughtSignature?: string
    ) {}
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
export const RECIPIENT_MANIAC = 'MANIAC';

export interface GameMessage {
    id: string | null;           // Will be null for new messages, set by Firestore
    recipientName: string;      // Who should receive this message
    authorName: string;         // Who sent this message
    msg: any;                   // The message content
    messageType: string;        // Type of the message (e.g., BOT_ANSWER, GAME_STORY)
    day: number;                // The game day when this message was created
    timestamp: number | null;   // UTC epoch timestamp in milliseconds, null for new messages
    cost?: number;              // Cost in USD for this message (for AI-generated messages)
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant' | 'developer';
    content: string;
    thinking?: string;  // Optional thinking content for models that support extended thinking
    anthropicThinkingSignature?: string;  // Signature for Anthropic/Claude thinking (required for multi-turn)
    googleThoughtSignature?: string;  // Signature for Google/Gemini thinking (required for multi-turn)
}
