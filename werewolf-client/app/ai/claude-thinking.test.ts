import dotenv from "dotenv";
dotenv.config();
import { ClaudeAgent } from "./anthropic-agent";
import { AIMessage } from "@/app/api/game-models";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { BotAnswerZodSchema } from "@/app/ai/prompts/zod-schemas";

// Skip if no API key
const hasApiKey = process.env.ANTHROPIC_K;
const describeOrSkip = hasApiKey ? describe : describe.skip;

describeOrSkip("Claude Agent Thinking & Mixed History", () => {
    
    const botName = "Claude Tester";
    const instruction = format(BOT_SYSTEM_PROMPT, {
        name: botName,
        personal_story: "I am a logic tester.",
        play_style: "Logical",
        role: "Tester",
        werewolf_teammates_section: "",
        players_names: "Alice",
        dead_players_names_with_roles: "",
        bot_context: "",
        human_player_name: "Human"
    });

    // Use a thinking-capable model
    const model = SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING].modelApiName;

    it("should return thinking content and signature when thinking is enabled", async () => {
        const agent = new ClaudeAgent(botName, instruction, model, process.env.ANTHROPIC_K!, true);
        
        const messages: AIMessage[] = [{
            role: 'user',
            content: "What is 15 * 13? Explain your reasoning."
        }];

        const [response, thinking, tokenUsage, signature] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

        console.log("Claude Thinking Content:", thinking?.substring(0, 100) + "...");
        console.log("Claude Signature present:", !!signature);

        expect(response.reply).toBeDefined();
        if (thinking && thinking.length > 0) {
             expect(signature).toBeDefined();
             expect(signature!.length).toBeGreaterThan(10);
        }
    }, 45000);

    it("should handle mixed history (Text-only + Thinking) without crashing", async () => {
        const agent = new ClaudeAgent(botName, instruction, model, process.env.ANTHROPIC_K!, true);
        
        // Construct a mixed history
        // This simulates switching from a non-thinking model to Claude Thinking
        const messages: AIMessage[] = [
            {
                role: 'user',
                content: "Hi, I am Alice."
            },
            {
                role: 'assistant',
                content: "Hello Alice.",
                // No thinking, no signature
            },
            {
                role: 'user',
                content: "What is my name?"
            }
        ];

        // This call should succeed. The agent should treat the previous message as text-only 
        // and still be able to "think" for the new response.
        const [response, thinking, tokenUsage, signature] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);
        
        expect(response.reply).toBeDefined();
        // It should still think for this turn
        if (thinking) {
             console.log("Thinking works after mixed history!");
             expect(signature).toBeDefined();
        }
    }, 45000);

    it("should safeguard against missing signatures (Thinking present but NO signature)", async () => {
        const agent = new ClaudeAgent(botName, instruction, model, process.env.ANTHROPIC_K!, true);
        
        const messages: AIMessage[] = [
            {
                role: 'user',
                content: "Analyze this."
            },
            {
                role: 'assistant',
                content: "I have analyzed it.",
                thinking: "This is a fake thought that lost its signature.",
                // MISSING SIGNATURE: This would normally crash Claude API
            },
            {
                role: 'user',
                content: "What was your conclusion?"
            }
        ];

        // The agent should drop the invalid thinking block and send only text
        const [response, thinking, tokenUsage, signature] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

        expect(response.reply).toBeDefined();
        console.log("Claude Safeguard response:", response.reply);
    }, 45000);

});
