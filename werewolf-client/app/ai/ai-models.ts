import { Timestamp } from "firebase/firestore";

export const API_KEY_CONSTANTS = {
    OPENAI: 'OPENAI_API_KEY',
    ANTHROPIC: 'ANTHROPIC_API_KEY',
    GOOGLE: 'GOOGLE_API_KEY',
    MISTRAL: 'MISTRAL_API_KEY',
    DEEPSEEK: 'DEEPSEEK_API_KEY'
} as const;

export const SupportedAiKeyNames: Record<string, string> = {
    [API_KEY_CONSTANTS.OPENAI]: 'OpenAI',
    [API_KEY_CONSTANTS.ANTHROPIC]: 'Anthropic',
    [API_KEY_CONSTANTS.GOOGLE]: 'Google',
    [API_KEY_CONSTANTS.MISTRAL]: 'Mistral',
    [API_KEY_CONSTANTS.DEEPSEEK]: 'DeepSeek'
};

// todo: Add Grok (grok-3-latest, grok-3-fast-latest)
export const LLM_CONSTANTS = {
    CLAUDE_37_SONNET: 'Claude 3.7 Sonnet',
    CLAUDE_35_HAIKU: 'Claude 3.5 Haiku',
    DEEPSEEK_CHAT: 'DeepSeek Chat',
    DEEPSEEK_REASONER: 'DeepSeek Reasoner',
    GPT_4O: 'GPT-4o', // todo: Replace with gpt-4.1
    GPT_4O_MINI: 'GPT-4o Mini', // todo: Replace with gpt-4.1-mini
    GPT_O1: 'o1', // todo: Replace with o3
    GPT_O3_MINI: 'o3-mini', // todo: Replace with o4-mini
    GEMINI_2_FLASH: 'Gemini 2.0 Flash', // todo: Update to gemini-2.5-flash-preview
    GEMINI_15_PRO: 'Gemini 1.5 Pro', // todo: Replace with 2.5 Pro
    MISTRAL_2_LARGE: 'Mistral 2 Large',
    MISTRAL_3_SMALL: 'Mistral 3 Small',
    RANDOM: 'Random',
}

export const SupportedAiModels = {
    [LLM_CONSTANTS.CLAUDE_37_SONNET]: {
        modelApiName: 'claude-3-7-sonnet-latest',
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
    [LLM_CONSTANTS.GPT_O1]: {
        modelApiName: 'o1',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GPT_O3_MINI]: {
        modelApiName: 'o3-mini',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GEMINI_2_FLASH]: {
        modelApiName: 'gemini-2.0-flash',
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
    [LLM_CONSTANTS.MISTRAL_3_SMALL]: {
        modelApiName: 'mistral-small-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL
    },
    [LLM_CONSTANTS.DEEPSEEK_CHAT]: {
        modelApiName: 'deepseek-chat',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK
    },
    [LLM_CONSTANTS.DEEPSEEK_REASONER]: {
        modelApiName: 'deepseek-reasoner',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK
    },
} as const;

export type LLMModel = keyof typeof SupportedAiModels;
