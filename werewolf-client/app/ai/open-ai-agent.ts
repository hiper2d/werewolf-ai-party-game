import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AgentMessageDto} from "@/app/ai/ai-models";
import ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;
import ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
import {util} from "protobufjs";
import float = util.float;

export class OpenAiAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(id: string, name: string, instruction: string, model: string, apiKey: string, temperature: number) {
        super(id, name, instruction, temperature);
        this.model = model;
        this.client = new OpenAI({
            apiKey: apiKey,
        })
    }

    async ask(messages: AgentMessageDto[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        const cl = this.client as OpenAI

        const openAiMessages = new Array<ChatCompletionMessageParam>();
        openAiMessages.push({role: 'system', content: this.instruction});
        messages.forEach(msg => {
            openAiMessages.push({
                role: msg.role as 'user' | 'assistant' | 'system',
                content: msg.msg
            });
        });

        try {
            const completion: ChatCompletion = await this.client.chat.completions.create({
                model: this.model,
                messages: openAiMessages,
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