import { BotAnswer } from "@/app/api/game-models";

// Schema type for response validation
export type ResponseSchema = {
    type: string;
    properties: {
        [key: string]: {
            type: string;
            description?: string;
            items?: ResponseSchema;
            properties?: {
                [key: string]: ResponseSchema;
            };
        };
    };
    required?: string[];
};

// Story generation interface
export interface GameSetup {
    scene: string;      // The vivid scene description
    players: Array<{
        name: string;   // Single-word unique name
        story: string;  // 1-2 sentence character background
    }>;
}

// Bot answer schema for response validation
export const createBotAnswerSchema = (): ResponseSchema => ({
    type: 'object',
    properties: {
        reply: {
            type: 'string',
            description: 'The bot\'s response message'
        }
    },
    required: ['reply']
});

// Game setup schema for story generation
export const createGameSetupSchema = (): ResponseSchema => ({
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
                    story: {
                        type: 'string',
                        description: '1-2 sentence character background'
                    }
                },
                required: ['name', 'story']
            }
        }
    },
    required: ['scene', 'players']
});