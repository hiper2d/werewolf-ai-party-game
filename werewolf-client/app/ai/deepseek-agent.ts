import OpenAI from "openai";
import { AIMessage } from "@/app/api/game-models";
import { AbstractAgent } from "@/app/ai/abstract-agent";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import { cleanResponse } from "@/app/utils/message-utils";

export class DeepSeekAgent extends AbstractAgent {
  private readonly client: OpenAI;

  constructor(
    name: string,
    instruction: string,
    model: string,
    apiKey: string,
    temperature: number = 0.7
  ) {
    super(name, instruction, model, temperature);
    this.client = new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: apiKey,
    });
  }

  private processCompletion(completion: any): string | null {
    const reply = completion.choices[0].message?.content;
    const reasoning = completion.choices[0].message?.reasoning_content;
    this.logger(`Raw reply: ${reply}`);
    if (reasoning !== undefined) {
      this.logger(`Reasoning tokens: ${reasoning}`);
    }
    if (!reply) return null;
    const cleanedReply = cleanResponse(reply);
    this.logger(`Final reply: ${cleanedReply}`);
    return cleanedReply;
  }

  async ask(messages: AIMessage[]): Promise<string | null> {
    this.logger(`Asking ${this.model} agent. Last message: ${messages[messages.length - 1].content}`);

    const preparedMessages = this.prepareMessages(messages);
    if (preparedMessages.length > 0) {
      preparedMessages[0].content = `${this.instruction}\n\n${preparedMessages[0].content}`;
    }

    try {
      const completion = await this.client.chat.completions.create({
        messages: preparedMessages,
        model: this.model,
        temperature: this.temperature,
        response_format: {
          type: 'json_object'
        }
      });
      return this.processCompletion(completion);
    } catch (error) {
      this.logger(`Error in ${this.name} agent: ${error}`);
      return null;
    }
  }

  async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null> {
    this.logger(`Asking ${this.model} agent with schema.`);
    this.logger(`Messages:\n${JSON.stringify(messages, null, 2)}`);

    try {
      // Construct the schema instructions
      const schemaInstructions = `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`;

      // Modify the last message to include schema instructions
      const lastMessage = messages[messages.length - 1];
      const fullPrompt = `${lastMessage.content}

${schemaInstructions}`;
      const modifiedMessages = [
        ...messages.slice(0, -1),
        { ...lastMessage, content: fullPrompt },
      ];

      // Prepare messages and add instruction to the first message
      const preparedMessages = this.prepareMessages(modifiedMessages);
      if (preparedMessages.length > 0) {
        preparedMessages[0].content = `${this.instruction}\n\n${preparedMessages[0].content}`;
      }

      const completion = await this.client.chat.completions.create({
        messages: preparedMessages,
        model: this.model,
        temperature: this.temperature,
        response_format: {
          type: 'json_object'
        }
      });
      return this.processCompletion(completion);
    } catch (error) {
      this.logger(`Error in ${this.name} agent: ${error}`);
      return null;
    }
  }
}
