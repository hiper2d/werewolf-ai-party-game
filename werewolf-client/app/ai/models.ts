export enum MessageRole {
    SYSTEM = 'system',
    USER = 'user',
    ASSISTANT = 'assistant'
}

export enum LLMModel {
    CLAUDE_35_SONNET = 'Claude 3.5 Sonnet',
    GPT_4O = 'GPT-4o',
    GPT_O1 = 'GPT-o1',
    GEMINI_PRO_15 = 'Gemini Pro 1.5',
    MISTRAL_LARGE_2 = 'Mistral Large 2'
}

export const SupportedAiModelNames: Record<LLMModel, string> = {
    [LLMModel.CLAUDE_35_SONNET]: '3.5 Sonnet',
    [LLMModel.GPT_4O]: '4o',
    [LLMModel.GPT_O1]: 'o1',
    [LLMModel.GEMINI_PRO_15]: '1.5',
    [LLMModel.MISTRAL_LARGE_2]: '2'
};

export interface AgentMessageDto {
    recipientId: string;
    authorId: string;
    authorName: string;
    role: MessageRole;
    msg: string;
}