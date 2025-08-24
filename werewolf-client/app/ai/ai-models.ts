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
    CLAUDE_4_OPUS: 'Claude 4.1 Opus',
    CLAUDE_4_OPUS_THINKING: 'Claude 4.1 Opus (Thinking)',
    CLAUDE_4_SONNET: 'Claude 4 Sonnet',
    CLAUDE_4_SONNET_THINKING: 'Claude 4 Sonnet (Thinking)',
    DEEPSEEK_CHAT: 'DeepSeek Chat',
    DEEPSEEK_REASONER: 'DeepSeek Reasoner',
    GPT_5: 'GPT-5',
    GPT_5_MINI: 'GPT-5-mini',
    GEMINI_25_PRO: 'Gemini 2.5 Pro',
    MISTRAL_2_LARGE: 'Mistral Large 2.1',
    MISTRAL_3_MEDIUM: 'Mistral Medium 3.1',
    MISTRAL_MAGISTRAL: 'Magistral Medium 1.1 (Thinking)',
    GROK_4: 'Grok 4',
    KIMI_K2: 'Kimi K2',
    RANDOM: 'Random',
}

export const SupportedAiModels = {
    // Claude models - separate with/without thinking versions
    [LLM_CONSTANTS.CLAUDE_4_OPUS]: {
        modelApiName: 'claude-opus-4-1',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false
    },
    [LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING]: {
        modelApiName: 'claude-opus-4-1',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET]: {
        modelApiName: 'claude-sonnet-4-0',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: false
    },
    [LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING]: {
        modelApiName: 'claude-sonnet-4-0',
        apiKeyName: API_KEY_CONSTANTS.ANTHROPIC,
        hasThinking: true
    },
    
    // DeepSeek models - separate Chat and Reasoner
    [LLM_CONSTANTS.DEEPSEEK_CHAT]: {
        modelApiName: 'deepseek-chat',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: false
    },
    [LLM_CONSTANTS.DEEPSEEK_REASONER]: {
        modelApiName: 'deepseek-reasoner',
        apiKeyName: API_KEY_CONSTANTS.DEEPSEEK,
        hasThinking: true
    },
    
    // Models with always-on reasoning
    [LLM_CONSTANTS.GPT_5]: {
        modelApiName: 'gpt-5',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true
    },
    [LLM_CONSTANTS.GPT_5_MINI]: {
        modelApiName: 'gpt-5-mini',
        apiKeyName: API_KEY_CONSTANTS.OPENAI,
        hasThinking: true
    },
    [LLM_CONSTANTS.GEMINI_25_PRO]: {
        modelApiName: 'gemini-2.5-pro',
        apiKeyName: API_KEY_CONSTANTS.GOOGLE,
        hasThinking: true
    },
    [LLM_CONSTANTS.GROK_4]: {
        modelApiName: 'grok-4',
        apiKeyName: API_KEY_CONSTANTS.GROK,
        hasThinking: true
    },
    
    // Mistral models
    [LLM_CONSTANTS.MISTRAL_2_LARGE]: {
        modelApiName: 'mistral-large-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false
    },
    [LLM_CONSTANTS.MISTRAL_3_MEDIUM]: {
        modelApiName: 'mistral-medium-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: false
    },
    [LLM_CONSTANTS.MISTRAL_MAGISTRAL]: {
        modelApiName: 'magistral-medium-latest',
        apiKeyName: API_KEY_CONSTANTS.MISTRAL,
        hasThinking: true
    },
    
    // Models without reasoning
    [LLM_CONSTANTS.KIMI_K2]: {
        modelApiName: 'kimi-latest',
        apiKeyName: API_KEY_CONSTANTS.MOONSHOT,
        hasThinking: false
    },
} as const;

export type LLMModel = keyof typeof SupportedAiModels;
