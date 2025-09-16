/**
 * Legacy AI schema definitions - DEPRECATED
 * 
 * This file contains legacy schema definitions that have been replaced by Zod schemas.
 * New code should use the schemas from @/app/ai/prompts/zod-schemas.ts instead.
 * 
 * These exports are maintained for backward compatibility with existing tests
 * and will be removed in a future cleanup.
 */

// =============================================================================
// DEPRECATED - Use Zod schemas instead
// =============================================================================

/**
 * @deprecated Use BotAnswerZodSchema from zod-schemas.ts instead
 */
export type ResponseSchema = Record<string, any>;

/**
 * @deprecated Use BotAnswerZodSchema from zod-schemas.ts instead
 */
export const createBotAnswerSchema = () => ({
    type: 'object',
    properties: {
        reply: {
            type: 'string',
            description: 'The bot\'s response message'
        }
    },
    required: ['reply']
});

/**
 * @deprecated Use GmBotSelectionZodSchema from zod-schemas.ts instead
 */
export const createGmBotSelectionSchema = () => ({
    type: 'object',
    properties: {
        selected_bots: {
            type: 'array',
            items: {
                type: 'string'
            },
            description: 'Array of 1-3 bot names who should respond next',
            minItems: 1,
            maxItems: 3
        },
        reasoning: {
            type: 'string',
            description: 'Brief explanation of why these bots were selected'
        }
    },
    required: ['selected_bots', 'reasoning']
});

/**
 * @deprecated Use GameSetupZodSchema from zod-schemas.ts instead
 */
export const createGameSetupSchema = () => ({
    type: 'object',
    properties: {
        scene: {
            type: 'string',
            description: 'The vivid scene description'
        },
        players: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Single-word unique name'
                    },
                    gender: {
                        type: 'string',
                        description: 'male, female, or neutral'
                    },
                    story: {
                        type: 'string',
                        description: '1-2 sentence character background'
                    },
                    playStyle: {
                        type: 'string',
                        description: 'The playstyle identifier for this character (e.g., aggressive_provoker, protective_team_player, etc.)'
                    }
                },
                required: ['name', 'gender', 'story', 'playStyle']
            }
        }
    },
    required: ['scene', 'players']
});

/**
 * @deprecated Use BotVoteZodSchema from zod-schemas.ts instead
 */
export const createBotVoteSchema = () => ({
    type: 'object',
    properties: {
        who: {
            type: 'string',
            description: 'The name of the player you are voting to eliminate'
        },
        why: {
            type: 'string',
            description: 'Your reasoning for voting for this player (keep it brief but convincing)'
        }
    },
    required: ['who', 'why']
});

/**
 * @deprecated Use WerewolfActionZodSchema from zod-schemas.ts instead
 */
export const createWerewolfActionSchema = () => ({
    type: 'object',
    properties: {
        target: {
            type: 'string',
            description: 'The name of the player to eliminate'
        },
        reasoning: {
            type: 'string',
            description: 'Reasoning for the target selection'
        }
    },
    required: ['target', 'reasoning']
});

/**
 * @deprecated Use DoctorActionZodSchema from zod-schemas.ts instead
 */
export const createDoctorActionSchema = () => ({
    type: 'object',
    properties: {
        target: {
            type: 'string',
            description: 'The name of the player to protect from werewolf attacks'
        },
        reasoning: {
            type: 'string',
            description: 'Reasoning for the protection choice'
        }
    },
    required: ['target', 'reasoning']
});

/**
 * @deprecated Use DetectiveActionZodSchema from zod-schemas.ts instead
 */
export const createDetectiveActionSchema = () => ({
    type: 'object',
    properties: {
        target: {
            type: 'string',
            description: 'The name of the player to investigate and learn their role'
        },
        reasoning: {
            type: 'string',
            description: 'Reasoning for the investigation choice'
        }
    },
    required: ['target', 'reasoning']
});

// =============================================================================
// DEPRECATED INTERFACES - Use Zod inferred types instead
// =============================================================================

/**
 * @deprecated Use GameSetupZod type from zod-schemas.ts instead
 */
export interface GameSetup {
    scene: string;
    players: Array<{
        name: string;
        gender: string;
        story: string;
        playStyle: string;
    }>;
}

/**
 * @deprecated Use GmBotSelectionZod type from zod-schemas.ts instead
 */
export interface GmBotSelection {
    selected_bots: string[];
    reasoning: string;
}

/**
 * @deprecated Use BotVoteZod type from zod-schemas.ts instead
 */
export interface BotVote {
    who: string;
    why: string;
}

/**
 * @deprecated Use WerewolfActionZod type from zod-schemas.ts instead
 */
export interface WerewolfAction {
    target: string;
    reasoning: string;
}

/**
 * @deprecated Use DoctorActionZod type from zod-schemas.ts instead
 */
export interface DoctorAction {
    target: string;
    reasoning: string;
    thinking?: string;
}

/**
 * @deprecated Use DetectiveActionZod type from zod-schemas.ts instead
 */
export interface DetectiveAction {
    target: string;
    reasoning: string;
    thinking?: string;
}

/**
 * @deprecated Use NightResultsStoryZod type from zod-schemas.ts instead
 */
export interface NightResultsStory {
    story: string;
}