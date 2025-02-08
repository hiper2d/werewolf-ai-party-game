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

export const HISTORY_PREFIX = `
Here are previous messages from other players you haven't yet seen:
%player_name_to_message_list%
`