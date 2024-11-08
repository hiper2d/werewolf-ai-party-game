export const MESSAGE_ROLE = {
    SYSTEM: 'system',
    USER: 'user',
    ASSISTANT: 'assistant'
}

export const API_KEY_CONSTANTS = {
    OPENAI: 'OPENAI_API_KEY',
    ANTHROPIC: 'ANTHROPIC_API_KEY',
    GOOGLE: 'GOOGLE_API_KEY',
    MISTRAL: 'MISTRAL_API_KEY'
} as const;

export const SupportedAiKeyNames: Record<string, string> = {
    [API_KEY_CONSTANTS.OPENAI]: 'OPENAI',
    [API_KEY_CONSTANTS.ANTHROPIC]: 'ANTHROPIC',
    [API_KEY_CONSTANTS.GOOGLE]: 'GOOGLE',
    [API_KEY_CONSTANTS.MISTRAL]: 'MISTRAL'
};

export const LLM_CONSTANTS = {
    CLAUDE_35_SONNET: 'Claude 3.5 Sonnet',
    GPT_4O: 'GPT-4o',
    GPT_4O_MINI: 'GPT-4o Mini',
    GPT_O1_PREVIEW: 'o1-preview',
    GPT_O1_MINI: 'o1-mini',
    GEMINI_PRO_15: 'Gemini Pro 1.5',
    MISTRAL_LARGE_2: 'Mistral Large 2',
    RANDOM: 'Random'
}

export const SupportedAiModels = {
    [LLM_CONSTANTS.CLAUDE_35_SONNET]: {
        modelApiName: 'claude-3.5-sonnet', // Model ID used in API calls
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
    [LLM_CONSTANTS.GEMINI_PRO_15]: {
        modelApiName: 'gemini-pro-1.5',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE
    },
    [LLM_CONSTANTS.MISTRAL_LARGE_2]: {
        modelApiName: 'mistral-large-2',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL
    }
} as const;

export type LLMModel = keyof typeof SupportedAiModels;

export interface AgentMessageDto {
    recipientId: string;
    authorId: string;
    authorName: string;
    role: string;
    msg: string;
}