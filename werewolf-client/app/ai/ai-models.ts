export const API_KEY_CONSTANTS = {
    OPENAI: 'OPENAI_API_KEY',
    ANTHROPIC: 'ANTHROPIC_API_KEY',
    GOOGLE: 'GOOGLE_API_KEY',
    MISTRAL: 'MISTRAL_API_KEY',
    DEEPSEEK: 'DEEPSEEK_API_KEY',
    GROK: 'GROK_API_KEY',
    MOONSHOT: 'MOONSHOT_API_KEY'
} as const;

export const SupportedAiKeyNames: Record<string, string> = {
    [API_KEY_CONSTANTS.OPENAI]: 'OpenAI',
    [API_KEY_CONSTANTS.ANTHROPIC]: 'Anthropic',
    [API_KEY_CONSTANTS.GOOGLE]: 'Google',
    [API_KEY_CONSTANTS.MISTRAL]: 'Mistral',
    [API_KEY_CONSTANTS.DEEPSEEK]: 'DeepSeek',
    [API_KEY_CONSTANTS.GROK]: 'Grok',
    [API_KEY_CONSTANTS.MOONSHOT]: 'Moonshot'
};

export const LLM_CONSTANTS = {
    CLAUDE_4_OPUS: 'Claude 4 Opus',
    CLAUDE_4_SONNET: 'Claude 4 Sonnet',
    DEEPSEEK_CHAT: 'DeepSeek Chat',
    DEEPSEEK_REASONER: 'DeepSeek Reasoner',
    GPT_41: 'GPT-4.1',
    GPT_O4_MINI: 'o4-mini',
    GEMINI_25_PRO: 'Gemini 2.5 Pro',
    GPT_O3: 'o3',
    // GPT_O3_PRO: 'o3-pro', // Disabled: doesn't support conversation history properly
    MISTRAL_2_LARGE: 'Mistral 2 Large',
    MISTRAL_3_SMALL: 'Mistral 3 Small',
    GROK_4: 'Grok 4',
    KIMI_K2: 'Kimi K2',
    RANDOM: 'Random',
}

export const SupportedAiModels = {
    [LLM_CONSTANTS.CLAUDE_4_OPUS]: {
        modelApiName: 'claude-opus-4-0',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET]: {
        modelApiName: 'claude-sonnet-4-0',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC
    },
    [LLM_CONSTANTS.GPT_41]: {
        modelApiName: 'gpt-4.1',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GPT_O3]: {
        modelApiName: 'o3',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    // [LLM_CONSTANTS.GPT_O3_PRO]: {
    //     modelApiName: 'o3-pro',
    //     apiKeyName: API_KEY_CONSTANTS.OPENAI
    // }, // Disabled: doesn't support conversation history properly
    [LLM_CONSTANTS.GPT_O4_MINI]: {
        modelApiName: 'o4-mini',
        apiKeyName: API_KEY_CONSTANTS.OPENAI
    },
    [LLM_CONSTANTS.GEMINI_25_PRO]: {
        modelApiName: 'gemini-2.5-pro',
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
    [LLM_CONSTANTS.GROK_4]: {
        modelApiName: 'grok-4',
        apiKeyName: API_KEY_CONSTANTS.GROK
    },
    [LLM_CONSTANTS.KIMI_K2]: {
        modelApiName: 'kimi-k2-0711-preview',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT
    },
} as const;

export type LLMModel = keyof typeof SupportedAiModels;
