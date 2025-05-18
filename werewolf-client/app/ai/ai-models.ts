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
    GPT_41: 'GPT-4.1',
    // GPT_O3: 'o3', this model requires some id verification which is weird, I exclude it for now
    GPT_O4_MINI: 'o4-mini',
    GEMINI_25_FLASH: 'Gemini 2.5 Flash Preview 04-17', //todo: update API lig to @google/genai as per docs https://ai.google.dev/gemini-api/docs/text-generation#javascript
    GEMINI_25_PRO: 'Gemini 2.5 Pro Preview 05-06',
    MISTRAL_2_LARGE: 'Mistral 2 Large',
    MISTRAL_3_SMALL: 'Mistral 3 Small',
    RANDOM: 'Random',
    // todo: add grok-3-beta and grok-3-mini-beta https://docs.x.ai/docs/models
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
    [LLM_CONSTANTS.GPT_41]: {
        modelApiName: 'gpt-4.1',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    /*[LLM_CONSTANTS.GPT_O3]: {
        modelApiName: 'o3',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },*/
    [LLM_CONSTANTS.GPT_O4_MINI]: {
        modelApiName: 'o4-mini',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GEMINI_25_FLASH]: {
        modelApiName: 'gemini-2.5-flash-preview-04-17',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE
    },
    [LLM_CONSTANTS.GEMINI_25_PRO]: {
        modelApiName: 'gemini-2.5-pro-preview-05-06',
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
