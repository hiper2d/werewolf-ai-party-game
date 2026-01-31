export const GM_COMMAND_INTRODUCE_YOURSELF: string = `Welcome to the game, %bot_name%! Please introduce yourself to the group. \
Use your character and story to create a thematic introduction. Don't reveal you tactics and strategies. \
Push your store a little further in your introduction, add some development to it.`;

export const GM_COMMAND_SELECT_RESPONDERS: string = `Based on the recent chat messages, select 2-5 bots who should respond next from this list of candidates: %candidate_names%

REMINDER: Include at least one bot marked "⚠️NEEDS TURN" in DayActivityData to ensure fair participation.`;

export const HISTORY_PREFIX = `
Here are previous messages from other players you haven't yet seen:
%player_name_to_message_list%
`

export const GM_COMMAND_REPLY_TO_DISCUSSION: string = `%bot_name%, reply to the players in the discussion. Be thoughtful and consider what has been said so far. \
Use your character and story to add thematic flavor to your response. Push your story a little further or keep it consistent with your background.`;

export const GM_COMMAND_GENERATE_NIGHT_RESULTS: string = `Generate the night results story based on the following night events.

<NightEvents>
<Deaths>%deathsSummary%</Deaths>
<WerewolfKillPrevented>%werewolfKillPrevented%</WerewolfKillPrevented>
<QuietNight>%quietNight%</QuietNight>
<DetectiveResult>%detectiveResultSummary%</DetectiveResult>
</NightEvents>

<StorytellingRules>
**CRITICAL INFORMATION DISCLOSURE RULES:**
1. **Names can ONLY be revealed if the player DIED during the night**
2. **Roles can ONLY be revealed if the player DIED during the night**
3. **Maniac abductions are SECRET - NEVER mention abductions in the narrative**
4. **Detective findings MUST ALWAYS be revealed but anonymously:**
   - If detective found evil (FOUND_EVIL): Use "shadows clung deep" or similar dark language
   - If detective found innocent (FOUND_INNOCENT): Use "bore no stain of evil" or similar pure language
   - NEVER reveal the target's name or identity unless they died
   - If investigation was blocked (BLOCKED): The detective found nothing (action failed silently)
   - If detective was inactive (INACTIVE): Do not mention the detective at all
5. **All other activities must be described anonymously**

**Understanding Deaths:**
- Deaths are listed as: "PlayerName (role) — cause"
- Causes: "werewolf attack", "doctor kill", "maniac collateral"
- "maniac collateral" means the maniac died and their abducted victim died too — reveal both deaths dramatically but do NOT mention abduction
- "doctor kill" means the doctor used their one-time kill ability — describe as mysterious medical incident
- If Deaths is NONE: no one died tonight

**Story Requirements:**
- Start with "🌅 **Dawn breaks over the village.**"
- Create atmospheric, thematic narrative appropriate to the game setting
- Use dramatic language and vivid descriptions
- Build suspense and maintain the game's mood
- End with transition to day discussion

**CRITICAL: Role Naming Rules:**
- ALWAYS use the exact role names: "werewolves", "detective", "doctor", "maniac"
- NEVER use synonyms like "healer", "seeker", "wolves", "investigator", "kidnapper", etc.
- When referring to roles, use the exact terms: "the werewolves", "the detective", "the doctor", "the maniac"

**Content Guidelines:**
- If someone died from werewolf attack: Reveal their name and role dramatically
- If someone died from doctor kill: Reveal their name and role, describe as mysterious medical incident
- If maniac collateral deaths occurred: Both deaths should be revealed dramatically, but never mention abduction
- If WerewolfKillPrevented is TRUE: Create suspense about the near-death experience (doctor saved someone)
- If QuietNight is TRUE: Create mysterious atmosphere about a quiet night where nothing happened
- Detective findings: Follow DetectiveResult value (FOUND_EVIL, FOUND_INNOCENT, BLOCKED, INACTIVE)
- Always maintain game balance and fairness in information revelation
- NEVER reveal maniac activity or abductions - this is secret information
</StorytellingRules>

`;