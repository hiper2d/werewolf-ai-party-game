export const MESSAGE_ROLE = {
    SYSTEM: 'system',
    USER: 'user',
    ASSISTANT: 'assistant'
}

export const LLM_CONSTANTS = {
    CLAUDE_35_SONNET: 'Claude 3.5 Sonnet',
    GPT_4O: 'GPT-4o',
    GPT_4O_MINI: 'GPT-4o Mini',
    GPT_O1: 'GPT-o1',
    GEMINI_PRO_15: 'Gemini Pro 1.5',
    MISTRAL_LARGE_2: 'Mistral Large 2',
    RANDOM: 'Random'
}

export const SupportedAiModelNames: Record<string, string> = {
    [LLM_CONSTANTS.CLAUDE_35_SONNET]: '3.5 Sonnet',
    [LLM_CONSTANTS.GPT_4O]: 'gpt-4o',
    [LLM_CONSTANTS.GPT_4O_MINI]: 'gpt-4o-mini',
    [LLM_CONSTANTS.GPT_O1]: 'o1',
    [LLM_CONSTANTS.GEMINI_PRO_15]: '1.5',
    [LLM_CONSTANTS.MISTRAL_LARGE_2]: '2',
    [LLM_CONSTANTS.RANDOM]: 'Mixed'
};

export interface AgentMessageDto {
    recipientId: string;
    authorId: string;
    authorName: string;
    role: string;
    msg: string;
}