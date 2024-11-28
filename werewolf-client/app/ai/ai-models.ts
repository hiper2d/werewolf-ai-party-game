import { Timestamp } from "firebase/firestore";

export const API_KEY_CONSTANTS = {
    OPENAI: 'OPENAI_API_KEY',
    ANTHROPIC: 'ANTHROPIC_API_KEY',
    GOOGLE: 'GOOGLE_API_KEY',
    MISTRAL: 'MISTRAL_API_KEY'
} as const;

export const SupportedAiKeyNames: Record<string, string> = {
    [API_KEY_CONSTANTS.OPENAI]: 'OpenAI',
    [API_KEY_CONSTANTS.ANTHROPIC]: 'Anthropic',
    [API_KEY_CONSTANTS.GOOGLE]: 'Google',
    [API_KEY_CONSTANTS.MISTRAL]: 'Mistral'
};

export const LLM_CONSTANTS = {
    CLAUDE_35_SONNET: 'Claude 3.5 Sonnet',
    CLAUDE_35_HAIKU: 'Claude 3.5 Haiku',
    GPT_4O: 'GPT-4o',
    GPT_4O_MINI: 'GPT-4o Mini',
    GPT_O1_PREVIEW: 'o1-preview',
    GPT_O1_MINI: 'o1-mini',
    GEMINI_15_FLASH: 'Gemini 1.5 Flash',
    GEMINI_15_PRO: 'Gemini 1.5 Pro',
    MISTRAL_2_LARGE: 'Mistral 2 Large',
    MISTRAL_2_SMALL: 'Mistral 2 Small',
    RANDOM: 'Random'
}

export const SupportedAiModels = {
    [LLM_CONSTANTS.CLAUDE_35_SONNET]: {
        modelApiName: 'claude-3-5-sonnet-latest',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC
    },
    [LLM_CONSTANTS.CLAUDE_35_HAIKU]: {
        modelApiName: 'claude-3-5-haiku-latest',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC
    },
    [LLM_CONSTANTS.GPT_4O]: {
        modelApiName: 'gpt-4o',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GPT_4O_MINI]: {
        modelApiName: 'gpt-4o-mini',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GPT_O1_PREVIEW]: {
        modelApiName: 'o1-preview',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GPT_O1_MINI]: {
        modelApiName: 'o1-mini',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GEMINI_15_FLASH]: {
        modelApiName: 'gemini-1.5-flash',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE
    },
    [LLM_CONSTANTS.GEMINI_15_PRO]: {
        modelApiName: 'gemini-1.5-pro',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE
    },
    [LLM_CONSTANTS.MISTRAL_2_LARGE]: {
        modelApiName: 'mistral-large-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL
    },
    [LLM_CONSTANTS.MISTRAL_2_SMALL]: {
        modelApiName: 'mistral-small-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL
    }
} as const;

export type LLMModel = keyof typeof SupportedAiModels;
