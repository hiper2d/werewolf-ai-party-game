import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {User} from "@/app/api/models";
import {AgentMessageDto, LLMModel, SupportedAiModelNames} from "@/app/ai/models";
import ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;

export class OpenAiAgent extends AbstractAgent {
    private client: OpenAI;
    private model = SupportedAiModelNames[LLMModel.GPT_4O];

    constructor(id: string, name: string, instruction: string, user: User) {
        super(id, name, instruction, 0.2);
        this.client = new OpenAI({
            apiKey: user.apiKeys[LLMModel.GPT_4O],
        })
    }

    async ask(messages: AgentMessageDto[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        const cl = this.client as OpenAI

        try {
            const completion: ChatCompletion = await this.client.chat.completions.create({
                model: this.model,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.msg
                })),
                temperature: this.temperature,
            });

            const reply = completion.choices[0].message?.content;
            this.logger(`Reply: ${reply}`);
            return reply || null;
        } catch (error) {
            console.error('Error in OpenAiAgent.ask:', error);
            return null;
        }
    }
}