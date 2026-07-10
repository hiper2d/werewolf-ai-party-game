import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
import { UPCOMING_GPT_5_6_MODELS } from "@/app/ai/ai-models";

/**
 * Availability probe for the GPT-5.6 family (limited API preview as of July 2026).
 *
 * These tests FAIL while our account has no access (404 "limited preview") and
 * start PASSING when OpenAI opens the models up. Re-run periodically:
 *
 *   npm run test:live -- -t "GPT-5.6 availability"
 *
 * models.retrieve is a free metadata call — no tokens are spent. When all three
 * go green, promote the models into SupportedAiModels / MODEL_PRICING following
 * the staged plan next to UPCOMING_GPT_5_6_MODELS in ai-models.ts.
 */

const hasApiKey = process.env.OPENAI_K;
const describeOrSkip = hasApiKey ? describe : describe.skip;

describeOrSkip("GPT-5.6 availability", () => {
    const client = new OpenAI({ apiKey: process.env.OPENAI_K });

    it.each([...UPCOMING_GPT_5_6_MODELS])(
        "%s is available on this account",
        async (model) => {
            try {
                const info = await client.models.retrieve(model);
                expect(info.id).toBe(model);
            } catch (error) {
                throw new Error(
                    `${model} is not available yet: ${error instanceof Error ? error.message : error}`
                );
            }
        }
    );
});
