export const GM_COMMAND_INTRODUCE_YOURSELF: string = `Welcome to the game! Please introduce yourself to the group.

Your response must follow this schema:

{
    type: "object",
    properties: {
        reply: {
            type: "string",
            description: "Your introduction message to the group"
        }
    },
    required: ["reply"]
}

Return a single JSON object matching this schema.`;

export const GM_COMMAND_SELECT_RESPONDERS: string = `Based on the recent chat messages, select 1-3 bots who should respond next.
Consider the conversation flow, relevance to each bot's role and personality, and maintain engaging group dynamics.

Your response must follow this schema:

{
    type: "object",
    properties: {
        selected_bots: {
            type: "array",
            description: "Array of 1-3 bot names who should respond next",
            items: {
                type: "string"
            },
            minItems: 1,
            maxItems: 3
        },
        reasoning: {
            type: "string",
            description: "Brief explanation of why these bots were selected"
        }
    },
    required: ["selected_bots", "reasoning"]
}

Return a single JSON object matching this schema.`;

export const HISTORY_PREFIX = `
Here are previous messages from other players you haven't yet seen:
%player_name_to_message_list%
`