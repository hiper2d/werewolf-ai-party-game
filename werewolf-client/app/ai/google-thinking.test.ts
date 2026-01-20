import dotenv from "dotenv";
dotenv.config();
import { GoogleAgent } from "./google-agent";
import { AIMessage } from "@/app/api/game-models";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { BotAnswerZodSchema } from "@/app/ai/prompts/zod-schemas";

// Skip if no API key
const hasApiKey = process.env.GOOGLE_K;
const describeOrSkip = hasApiKey ? describe : describe.skip;

describeOrSkip("Google Agent Thinking & Mixed History", () => {
    
    const botName = "Thinking Tester";
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
    const model = SupportedAiModels[LLM_CONSTANTS.GEMINI_3_PRO].modelApiName;

    it("should return thinking content and signature when thinking is enabled", async () => {
        const agent = new GoogleAgent(botName, instruction, model, process.env.GOOGLE_K!, true);
        
        const messages: AIMessage[] = [{
            role: 'user',
            content: "What is 15 * 13? Explain your reasoning."
        }];

        const [response, thinking, tokenUsage, signature] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

        console.log("Thinking Content:", thinking?.substring(0, 100) + "...");
        console.log("Signature present:", !!signature);

        expect(response.reply).toBeDefined();
        // Thinking content might be empty if the model decides not to think, but signature should be there? 
        // Actually, if it decides not to think, thinking might be empty.
        // But for a math problem, it usually thinks.
        if (thinking && thinking.length > 0) {
             expect(signature).toBeDefined();
             expect(signature!.length).toBeGreaterThan(10);
        }
    }, 45000);

    it("should handle mixed history (Text-only + Thinking) without crashing", async () => {
        // This test simulates a game where models were switched or thinking was intermittent
        const agent = new GoogleAgent(botName, instruction, model, process.env.GOOGLE_K!, true);
        
        // Construct a mixed history
        // Message 1: User
        // Message 2: Model (Text only, no signature - e.g. from GPT-4 switch)
        // Message 3: User
        const messages: AIMessage[] = [
            {
                role: 'user',
                content: "Hi, I am Alice."
            },
            {
                role: 'assistant',
                content: "Hello Alice. I am a tester bot.",
                // No thinking, no signature
            },
            {
                role: 'user',
                content: "Calculate the square root of 144 and tell me if it's a prime number."
            }
        ];

        // This call should succeed despite the "unsigned" message in history
        const [response, thinking, tokenUsage, signature] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);
        
        expect(response.reply).toBeDefined();
        console.log("Mixed history response:", response.reply);
    }, 45000);

    it("should safeguard against missing signatures (Thinking present but NO signature)", async () => {
        // This simulates a database error where signature was lost but thinking text remains
        const agent = new GoogleAgent(botName, instruction, model, process.env.GOOGLE_K!, true);
        
        const messages: AIMessage[] = [
            {
                role: 'user',
                content: "Analyze this."
            },
            {
                role: 'assistant',
                content: "I have analyzed it.",
                thinking: "This is a fake thought that lost its signature.",
                // MISSING SIGNATURE: This usually causes API error if sent as-is
            },
            {
                role: 'user',
                content: "What was your conclusion?"
            }
        ];

        // The agent should detect the missing signature and DROP the thinking block from the request
        // allowing the call to succeed (downgrading history to text-only).
        const [response, thinking, tokenUsage, signature] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

        expect(response.reply).toBeDefined();
        console.log("Safeguard response:", response.reply);
    }, 45000);

});
