import { BotAnswer } from "@/app/api/game-models";

// Make ResponseSchema completely flexible
export type ResponseSchema = Record<string, any>;

// Story generation interface
export interface GameSetup {
    scene: string;      // The vivid scene description
    players: Array<{
        name: string;   // Single-word unique name
        gender: string; // male, female, or neutral
        story: string;  // 1-2 sentence character background
    }>;
}

// GM bot selection interface
export interface GmBotSelection {
    selected_bots: string[];  // Array of 1-3 bot names
    reasoning: string;        // Explanation for the selection
}

// Bot vote interface
export interface BotVote {
    who: string;    // Name of the player being voted for
    why: string;    // Reasoning for the vote
}

// Bot answer schema for response validation
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

// GM bot selection schema for response validation
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

// Game setup schema for story generation
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
                    }
                },
                required: ['name', 'gender', 'story']
            }
        }
    },
    required: ['scene', 'players']
});

// Bot vote schema for response validation
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

// Werewolf action interface
export interface WerewolfAction {
    target: string;
    reasoning: string;
}

// Doctor action interface
export interface DoctorAction {
    target: string;
    reasoning: string;
    thinking?: string;
}

// Detective action interface
export interface DetectiveAction {
    target: string;
    reasoning: string;
    thinking?: string;
}

// Werewolf action schema for response validation
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

// Night results story interface
export interface NightResultsStory {
    story: string;
}

// Night results story schema for response validation
export const createNightResultsStorySchema = () => ({
    type: 'object',
    properties: {
        story: {
            type: 'string',
            description: 'The compelling night results narrative that follows all information disclosure rules'
        }
    },
    required: ['story']
});

// Doctor action schema for response validation
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

// Detective action schema for response validation
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