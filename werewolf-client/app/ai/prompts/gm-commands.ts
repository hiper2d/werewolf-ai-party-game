export const GM_COMMAND_INTRODUCE_YOURSELF: string = `Welcome to the game, %bot_name%! Please introduce yourself to the group. \
Use your character and story to create a thematic introduction. Don't reveal you tactics and strategies. \
Push your store a little further in your introduction, add some development to it.

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

export const GM_COMMAND_REPLY_TO_DISCUSSION: string = `%bot_name%, reply to the players in the discussion. Be thoughtful and consider what has been said so far. \
Use your character and story to add thematic flavor to your response. Push your story a little further or keep it consistent with your background.

Your response must follow this schema:

{
    type: "object",
    properties: {
        reply: {
            type: "string",
            description: "Your response to the ongoing discussion"
        }
    },
    required: ["reply"]
}

Return a single JSON object matching this schema.`;

export const GM_COMMAND_GENERATE_NIGHT_RESULTS: string = `Generate the night results story based on the following night events and conversation history.

<NightEvents>
<WerewolfAttack>
  <TargetKilled>%killedPlayer%</TargetKilled>
  <KilledPlayerRole>%killedPlayerRole%</KilledPlayerRole>
  <AttackPrevented>%wasKillPrevented%</AttackPrevented>
  <NoWerewolfActivity>%noWerewolfActivity%</NoWerewolfActivity>
</WerewolfAttack>

<DetectiveInvestigation>
  <FoundEvil>%detectiveFoundEvil%</FoundEvil>
  <InvestigatedDeadPlayer>%detectiveTargetDied%</InvestigatedDeadPlayer>
  <DetectiveWasActive>%detectiveWasActive%</DetectiveWasActive>
</DetectiveInvestigation>

<DoctorProtection>
  <DoctorWasActive>%doctorWasActive%</DoctorWasActive>
  <SuccessfullyPrevented>%wasKillPrevented%</SuccessfullyPrevented>
</DoctorProtection>
</NightEvents>

<StorytellingRules>
**CRITICAL INFORMATION DISCLOSURE RULES:**
1. **Names can ONLY be revealed if the player DIED during the night**
2. **Roles can ONLY be revealed if the player DIED during the night** 
3. **Detective findings MUST ALWAYS be revealed but anonymously:**
   - If detective found evil: Use "shadows clung deep" or similar dark language.
   - If detective found innocent: Use "bore no stain of evil" or similar pure language
   - NEVER reveal the target's name or identity unless they died
4. **All other activities must be described anonymously**

**Story Requirements:**
- Start with "🌅 **Dawn breaks over the village.**"
- Create atmospheric, thematic narrative appropriate to the game setting
- Use dramatic language and vivid descriptions
- Build suspense and maintain the game's mood
- End with transition to day discussion

**CRITICAL: Role Naming Rules:**
- ALWAYS use the exact role names: "werewolves", "detective", "doctor"
- NEVER use synonyms like "healer", "seeker", "wolves", "investigator", etc.
- When referring to roles, use the exact terms: "the werewolves", "the detective", "the doctor"

**Content Guidelines:**
- If someone died: Reveal their name and role dramatically
- If attack was prevented: Create suspense about the near-death experience
- Detective findings: ALWAYS reveal whether evil or innocent was found, but keep target anonymous
- If no werewolf activity: Create mysterious atmosphere about quiet night
- Always maintain game balance and fairness in information revelation
</StorytellingRules>

Your response must follow this schema:

{
    type: "object",
    properties: {
        story: {
            type: "string",
            description: "The night results story that reveals what happened during the night"
        }
    },
    required: ["story"]
}

Return a single JSON object matching this schema.`;