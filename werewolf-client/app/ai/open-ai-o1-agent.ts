import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {GameMessage} from "@/app/ai/ai-models";
import {util} from "protobufjs";
import ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;
import ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export class OpenAiO1Agent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, 1);
        this.model = model;
        this.client = new OpenAI({
            apiKey: apiKey,
        })
    }

    async ask(messages: GameMessage[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        const openAiMessages = new Array<ChatCompletionMessageParam>();
        messages.forEach(msg => {
            openAiMessages.push({
                role: msg.role as 'user' | 'assistant',
                content: msg.msg
            });
        });
        openAiMessages[0].content = this.instruction + openAiMessages[0].content

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