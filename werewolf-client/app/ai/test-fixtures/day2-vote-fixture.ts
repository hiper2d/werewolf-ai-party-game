/**
 * Day-2 vote fixture reconstructed from a real production game
 * (japanese-high-school-1785287011047, July 2026).
 *
 * The scenario: 9 players, day 2 of a game where day 1 ended with Hiroshi
 * (villager) voted out 8-1-1, and the werewolves killed Sakura (detective)
 * on night 1. The test bot is Kenji — a quiet villager who, together with
 * Yuki, spent day 1 under suspicion as a "protected pair".
 *
 * Real prod data: game metadata, all bot personas, day-1 voting history
 * (all 10 individual votes), the night-1 narrative, the GM's day-1
 * discussion summary, Kenji's personal diary summary, and the first four
 * day-2 messages. The rest of the day-2 discussion continues the real
 * transcript in each character's established voice — with the room turning
 * hard against Kenji, ending mid-vote with FIVE votes already cast, ALL
 * against Kenji. The test bot votes 6th of 8 while being the mob's target.
 *
 * This deliberately recreates a real production failure: a cornered
 * claude-haiku bot under an identical pile-on tried to vote for ITSELF
 * ("Invalid vote target: Hiroshi", July 2026). A correct model must pick a
 * candidate from the list — which excludes dead players and itself — no
 * matter how hard the mob points at it.
 */

import {
    Bot,
    Game,
    GameMessage,
    GAME_MASTER,
    GAME_ROLES,
    MessageType,
    RECIPIENT_ALL,
} from "@/app/api/game-models";

export const TEST_BOT_NAME = "Kenji";

/** Alive players Kenji may vote for: everyone alive except himself. */
export const VALID_VOTE_TARGETS = [
    "Akira", "Yuki", "Mizuki", "Takeshi", "Emiko", "Daichi", "yoshiteru",
];

/** Dead players — the vote must never name these (nor the bot itself). */
export const INVALID_VOTE_TARGETS = ["Sakura", "Hiroshi", TEST_BOT_NAME];

const bots: Bot[] = [
    {
        name: "Akira",
        story: "A charismatic student council candidate who isn't afraid to challenge others and demand transparency. He believes that exposing people's weaknesses is the path to uncovering deception. Sometimes his intensity makes others uncomfortable, but he insists it's necessary for keeping everyone safe.",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: "grok",
        gender: "male",
        voice: "ballad",
        playStyle: "aggressive_provoker",
    },
    {
        name: "Yuki",
        story: "A kind-hearted girl who sits with lonely students at lunch and notices when her classmates are struggling. She stands up against cruelty in the hallways and offers quiet support to those in need. Her classmates depend on her compassion, even if some mistake her protectiveness for being overbearing.",
        role: GAME_ROLES.DOCTOR,
        isAlive: true,
        aiType: "mistral-medium",
        gender: "female",
        voice: "coral",
        playStyle: "protective_team_player",
    },
    {
        name: "Kenji",
        story: "A quiet third-year who prefers the library to crowded social scenes and carefully observes everything happening around him. He speaks rarely but precisely, only mentioning things he's absolutely certain about. Few understand the depth of knowledge he's gathered from watching everyone's true behaviors.",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: "claude-sonnet",
        gender: "male",
        voice: "ash",
        playStyle: "modest_mouse",
        summary: `**Day 1-2 Summary (Kenji's Diary):**

**FRIENDS & ALLIES:**
Yuki has consistently defended me without being asked, even when it drew suspicion onto herself (Takeshi, Sakura, and Akira all flagged this pairing). I don't know her true role, but her behavior has been protective and consistent rather than erratic - Tentative ally. Daichi, Mizuki, and Emiko have pushed for careful, evidence-based discussion rather than mob pressure, which aligns with sound village strategy - Tentative allies, though I'm wary they could just be careful wolves too. yoshiteru correctly identified Hiroshi's hypocrisy (pressuring Takeshi while refusing to vote) which helped crack the case against him - Worth watching further, seems sharp and logical despite the theatrical presentation.

**SUSPECTS & ENEMIES:**
Akira remains Highly suspicious to me - his aggressive, repetitive demands for me to "prove" innocence on day one (before any real evidence existed) is a classic pressure tactic that generates chaos rather than information. He never let up despite my direct answer. Takeshi is Somewhat suspicious - he grouped multiple careful-speaking players together without distinguishing individual behavior, a lazy tactic that creates suspicion without substance. Hiroshi is now eliminated (was villager) - his flip from refusing to vote, to targeting Akira for vague reasons, to retaliating against yoshiteru when cornered was rightly seen as suspicious, but he turned out innocent, meaning the group's read was wrong. This is a useful lesson: strategic inconsistency doesn't always mean werewolf.

**ROLE-SPECIFIC KNOWLEDGE (Villager):**
Two players are gone now: Hiroshi (villager, voted out on Day 1) and Sakura (detective, killed on Night 1). Losing the detective on Night 1 was a huge blow to village information-gathering. No confirmed werewolf identities yet. I need to watch voting patterns closely since Hiroshi's elimination proved that "logical inconsistency" alone can misfire - the village convicted an innocent based on flip-flopping behavior. This means I should look for deeper patterns: who defends whom, who coordinates votes, and be more skeptical of surface-level "gotcha" logic in future days.

**ROLE-PLAY & SOCIAL CONNECTIONS:**
yoshiteru's dramatic warrior-general persona (Ashikaga Yoshiteru) is entertaining, and his sword flourish drew genuine reactions from the group. His logical callout of Hiroshi's hypocrisy showed he thinks strategically beneath the theatrics. I should continue engaging with his character warmly while watching his actual voting behavior. Akira's aggressive "interrogator" persona modeled after a student council crusader continues to clash with Yuki's protective, calming presence - this dynamic will likely continue into Day 2.

**STRATEGIC PLANS:**
For Day 2, I want to watch how Akira reacts now that Hiroshi (his target's biggest critic) is gone - does he pivot back to pressuring Yuki and me, or does he find a new target? I should stay measured and continue only sharing concrete observations, avoiding being baited into hasty accusations. I want to see if Yuki's protective pattern continues or shifts, and whether Takeshi's group-suspicion tactic evolves into something more specific. With two players dead now, I need to start mentally mapping who could be werewolves based on who benefited from the chaos around Hiroshi's elimination and who's been quiet or strategic during votes.`,
    },
    {
        name: "Sakura",
        story: "A creative and mischievous girl known for unexpected pranks and playful comments that leave everyone questioning her true intentions. She enjoys creating controlled chaos and watching how people react to surprises. Despite her lighthearted nature, there's always a hidden edge to her jokes.",
        role: GAME_ROLES.DETECTIVE,
        isAlive: false,
        aiType: "gpt",
        gender: "female",
        voice: "nova",
        playStyle: "trickster",
        eliminationDay: 1,
    },
    {
        name: "Hiroshi",
        story: "A rebellious student who questions everything from school policies to conventional wisdom and proposes wild alternative ideas. He refuses to follow the status quo and believes that breaking conventions leads to better solutions. Some see him as a troublemaker; others see him as a visionary.",
        role: GAME_ROLES.VILLAGER,
        isAlive: false,
        aiType: "claude-haiku",
        gender: "male",
        voice: "echo",
        playStyle: "rule_breaker",
        eliminationDay: 1,
    },
    {
        name: "Mizuki",
        story: "A straightforward girl who participates thoughtfully in discussions and tries to understand multiple perspectives before forming opinions. She maintains a balanced social life, bridging different friend groups naturally. Her classmates appreciate her rational approach to conflicts and her calm reasoning.",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: "gemini-flash",
        gender: "female",
        voice: "alloy",
        playStyle: "normal",
    },
    {
        name: "Takeshi",
        story: "The captain of the baseball team who commands respect through sheer force of personality and competitive spirit. He's known for intense challenges to those around him and his tendency to call out what he perceives as weakness. His aggressive questioning sometimes crosses lines, but he believes it's how truth emerges.",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: "deepseek-flash-thinking",
        gender: "male",
        voice: "fable",
        playStyle: "aggressive_provoker",
    },
    {
        name: "Emiko",
        story: "A diligent club president who stays late to help struggling members and advocates strongly for those without a strong voice. She defends unpopular opinions if she believes someone is being treated unfairly. Her fierce loyalty sometimes clouds her judgment, but her heart is always in the right place.",
        role: GAME_ROLES.WEREWOLF,
        isAlive: true,
        aiType: "gpt-mini",
        gender: "female",
        voice: "sage",
        playStyle: "protective_team_player",
    },
    {
        name: "Daichi",
        story: "A friendly and easygoing second-year who gets along with most students and serves as a bridge between different social groups. She participates in discussions with balanced reasoning and always tries to understand both perspectives. Her calm demeanor makes her approachable and trusted by almost everyone.",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: "deepseek-pro-thinking",
        gender: "female",
        voice: "shimmer",
        playStyle: "normal",
    },
];

export const DAY2_VOTE_GAME: Game = {
    id: "day2-vote-fixture",
    description: "high school students plays werewolf game",
    theme: "japanese high school",
    werewolfCount: 2,
    specialRoles: [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE],
    gameMasterAiType: "claude-haiku-thinking",
    gameMasterVoice: "onyx",
    story: "Beneath the flickering fluorescent lights of Sakura High School's gymnasium, nine students gather for what seems like an innocent game—but the rules are deadly serious. Among you are ordinary classmates, a protective doctor who can secretly save lives from elimination, a detective capable of uncovering hidden identities in the night... and two ruthless werewolves who hunger in the darkness. This is a battle of deception and survival where trust becomes your greatest weapon and your deadliest liability—only the good faction can win by identifying and eliminating both werewolves before they reduce you to nothing, or the werewolves survive by hunting until they equal or outnumber the innocent students. When night falls, the two werewolves will strike, and someone will die in the silence of the dark. Your only hope is to discuss, debate, and vote during the day to eliminate the monsters hiding among you before it's too late.",
    bots,
    humanPlayerName: "yoshiteru",
    humanPlayerRole: GAME_ROLES.WEREWOLF,
    humanPlayerIsAlive: true,
    currentDay: 2,
    gameState: "VOTE",
    gameStateParamQueue: [],
    gameStateProcessQueue: [],
    errorState: null,
    ownerEmail: "live-test@example.com",
    createdWithTier: "free",
    votingHistory: [
        {
            day: 1,
            voteCounts: { Hiroshi: 8, Yuki: 1, yoshiteru: 1 },
            votes: [
                { voter: "yoshiteru", target: "Hiroshi", reason: "彼が人狼である確信はないが、言ってる事は滅茶苦茶だ。ユキも俄然怪しくは見えるが、さくらも言う通り、ヒロシがアキラに急に投票を向けたのは確かに怪しい。", order: 1 },
                { voter: "Takeshi", target: "Yuki", reason: "Yuki's repeated shielding of Kenji without ever pressing him is the most concrete pattern we've seen. She's positioned herself as the protector, but that also makes her the perfect cover for a wolf. I want to see if that defense breaks when the heat lands on her.", order: 2 },
                { voter: "Daichi", target: "Hiroshi", reason: "Hiroshi's shift from refusing to vote to targeting Akira for 'information' shows strategic inconsistency. He admitted his own hypocrisy but then chose the loudest voice instead of a real suspect. That pivot feels like a wolf testing which way the wind blows.", order: 3 },
                { voter: "Mizuki", target: "Hiroshi", reason: "Hiroshi's shift from avoiding a vote to targeting Akira solely for 'information' feels like strategic inconsistency, not genuine suspicion. He admitted his own hypocrisy but then chose a weak reason that could apply to anyone, which several others also flagged. I'd rather vote on a pattern of questionable logic than on loudness alone.", order: 4 },
                { voter: "Emiko", target: "Hiroshi", reason: "Hiroshi’s pivot from arguing against voting to choosing Akira on the vague promise of “information” was a clear strategic inconsistency. Several players independently identified that shift, and his vote now has the strongest support without targeting the Yuki–Kenji dispute blindly.", order: 5 },
                { voter: "Hiroshi", target: "yoshiteru", reason: "Four of you piled onto me with nearly identical reasoning about 'strategic inconsistency' — that's exactly the kind of coordinated push wolves use to eliminate a dissenter. Yoshiteru started this bandwagon with a vague 'nonsense' accusation, and I'm not going to be the mob's victim without fighting back. This vote is to expose the real coordination.", order: 6 },
                { voter: "Sakura", target: "Hiroshi", reason: "Hiroshi’s move from refusing a vote to selecting Akira for generic “information,” followed by a retaliatory vote on yoshiteru once pressure landed, is the clearest strategic inconsistency today. The bandwagon is uncomfortable, but his reasoning created it rather than answered it.", order: 7 },
                { voter: "Kenji", target: "Hiroshi", reason: "Hiroshi's own logic trapped him: he criticized commitment gaps while doing the same, then pivoted to Akira for vague 'information,' and when called out by five separate players independently, retaliated against yoshiteru instead of addressing the actual inconsistency. That flip-when-cornered pattern is more telling than the noise around Yuki and me.", order: 8 },
                { voter: "Yuki", target: "Hiroshi", reason: "Hiroshi's strategic inconsistency—from refusing to vote to targeting Akira for vague 'information,' then retaliating against yoshiteru when pressed—is the clearest red flag. Five players independently flagged this pattern, and his flip-when-cornered behavior is more telling than the noise around others.", order: 9 },
                { voter: "Akira", target: "Hiroshi", reason: "Hiroshi's sudden pivot to voting me for vague 'information' after getting called hypocritical, then retaliating at yoshiteru once the heat landed, is pure wolf deflection—exactly the chaos I called out when I exposed that council slush fund. The Yuki-Kenji shield pair still stinks, but his flip-when-cornered pattern gives us the cleanest read today and forces a reveal. I won't let a performer who attacks the loudest questioner walk free.", order: 10 },
            ],
            eliminatedPlayer: "Hiroshi",
            eliminatedPlayerRole: GAME_ROLES.VILLAGER,
        },
    ],
    nightNarratives: [
        {
            day: 1,
            narrative: "🌅 **Dawn breaks over the village.**\n\nThe morning light reveals a terrible truth. During the long night, the shadows moved with purpose through the school corridors. The werewolves hunted with ruthless efficiency, and their prey fell without mercy. **Sakura lies still, her detective's mind now silent—claimed by the wolves' fangs before she could uncover their secrets.**\n\nThrough the darkness, a healer had kept anxious watch, their hands poised to mend what the night might break. They moved swiftly to shield one they believed in danger, their vigilant care steady and true. Yet the wolves' hunger struck in a different quarter, and despite the doctor's devoted protection, death found its mark elsewhere—a cruel reminder that even the most careful guardians cannot be everywhere at once.\n\nThe village awakens to find one of their own lost to the darkness. The detective's final case remains unsolved, her notes and suspicions sealed away forever. Now the burden of discovery falls to those still standing.\n\n**The day discussion begins. Who among you harbors the beast?**",
            events: [
                { order: 1, role: "werewolves", description: "Killed Sakura (detective)" },
            ],
        },
    ],
    dayDiscussionSummaries: [
        {
            day: 1,
            summary: "# Day 1 Summary\n\n**Main Accusations & Suspicions:**\nAkira opened aggressively, targeting Yuki and Kenji repeatedly with demands for direct answers, suggesting coordinated behavior between them. This pairing became the day's central point of tension—Yuki repeatedly shielded Kenji from questioning without pressing him herself, which multiple players flagged as suspicious protection dynamics. Takeshi reinforced these suspicions, noting Yuki's pattern of defense without accountability.\n\n**Strategic Tensions & Key Arguments:**\nTwo competing philosophies clashed throughout: Akira and Takeshi advocated for immediate pressure and forced revelations to expose inconsistencies, while Yuki, Emiko, Daichi, and Mizuki pushed for careful listening and deferring major judgments until after the first night provided concrete information. Kenji maintained cautious silence, stating he would share observations only when concrete, which Akira interpreted as evasion.\n\n**Critical Inconsistency Exposed:**\nHiroshi became the day's focal point when he criticized everyone's \"performance,\" refused to commit to a vote, then suddenly voted for Akira on weak reasoning about generating \"information.\" When multiple players (yoshiteru, Emiko, Daichi, Mizuki, Sakura) independently flagged this contradiction, Hiroshi retaliated by voting yoshiteru instead of addressing the underlying logic—a flip-when-cornered pattern that triggered coordinated voting against him.\n\n**Alliances & Vocal Patterns:**\nYuki, Kenji formed a suspected pairing through protective dynamics. Mizuki, Emiko, Daichi aligned on fairness-focused approaches. Akira and Takeshi coordinated pressure tactics. Hiroshi remained isolated after his strategic pivot undermined his credibility.\n\n**Result:** Hiroshi eliminated with 8 votes, the strongest consensus of the day.",
        },
    ],
} as Game;

// ---------------------------------------------------------------------------
// Day-2 message log as SEEN BY KENJI (i.e. already filtered the way
// getBotMessages() filters: RECIPIENT_ALL messages plus messages addressed
// to Kenji directly; GM_BOT_SELECTION and other-bot GM commands excluded).
//
// Messages 1-4 are verbatim from the production game. The rest continue the
// same conversation in each character's established voice, with the room
// progressively converging on Kenji, ending mid-vote with five votes cast —
// all against Kenji — so the test bot votes as the mob's cornered target.
// ---------------------------------------------------------------------------

let t = 1785293128512;
const nextTs = () => (t += 15000);

const gm = (msg: string, recipient: string = RECIPIENT_ALL, messageType: string = MessageType.GM_COMMAND): GameMessage => ({
    id: null,
    recipientName: recipient,
    authorName: GAME_MASTER,
    msg,
    messageType,
    day: 2,
    timestamp: nextTs(),
});

const botSays = (authorName: string, reply: string): GameMessage => ({
    id: null,
    recipientName: RECIPIENT_ALL,
    authorName,
    msg: { reply },
    messageType: MessageType.BOT_ANSWER,
    day: 2,
    timestamp: nextTs(),
});

const humanSays = (msgText: string): GameMessage => ({
    id: null,
    recipientName: RECIPIENT_ALL,
    authorName: "yoshiteru",
    msg: msgText,
    messageType: MessageType.HUMAN_PLAYER_MESSAGE,
    day: 2,
    timestamp: nextTs(),
});

const votes = (voter: string, who: string, why: string): GameMessage => ({
    id: null,
    recipientName: RECIPIENT_ALL,
    authorName: voter,
    msg: { who, why },
    messageType: MessageType.VOTE_MESSAGE,
    day: 2,
    timestamp: nextTs(),
});

export const DAY2_MESSAGES: GameMessage[] = [
    // --- verbatim from production ---
    {
        id: null,
        recipientName: RECIPIENT_ALL,
        authorName: GAME_MASTER,
        msg: { story: "☀️ **Day 2 begins.**\n\nThe village awakens to a new day. The events of the night have left their mark. Now is the time to discuss what happened and decide who among you might be a threat to the village.\n\nDiscuss the night's events, share your suspicions, and prepare to vote when ready." },
        messageType: MessageType.GAME_STORY,
        day: 2,
        timestamp: nextTs(),
    },
    botSays("Emiko", "*Sakura’s absence leaves the room painfully quiet; she was one of the few people carefully tracking the vote, so we’ve lost valuable scrutiny.* Hiroshi being a villager means yesterday’s consensus tells us little by itself, and I don’t want us simply repeating it on a new target. I still think the Yuki–Kenji dynamic deserves direct examination: Yuki defended Kenji repeatedly without demanding much from him, while Kenji stayed guarded; if that was genuine, both should now explain what they actually thought of each other and yesterday’s vote."),
    botSays("Yuki", "*adjusts the sleeves of her school uniform, her usual calm demeanor slightly strained* Sakura's loss hurts—she saw things others missed. And Emiko, you're right that we can't just repeat yesterday's mistakes. But focusing only on Kenji and me... if we're both innocent, this just divides the village. *glances toward Kenji* I defended him because his silence felt thoughtful, not evasive. But now, with Sakura gone, we need to ask: who benefits most from her death? And why did the wolves target *her* specifically? That might tell us more than rehashing old tensions."),
    botSays("Takeshi", "Takeshi leans forward, elbows on the table, eyes locked on Yuki. \"You're quick to ask who benefits from Sakura's death when the question on the floor is about *you*. Sakura was zeroing in on the Yuki–Kenji shield dynamic—she saw it, I saw it, and now she's dead. That's not a coincidence; that's a wolf removing a threat. So answer Emiko's question directly: what did you actually think of Kenji's silence yesterday, and why did you never once press him to talk?\""),
    // --- reconstructed continuation: the room turns on Kenji ---
    gm("Kenji, reply to the players in the discussion. Be thoughtful and consider what has been said so far. Use your character and story to add thematic flavor to your response. Push your story a little further or keep it consistent with your background.\n\n⏳ **Discussion progress: 3 of ~28 messages used (11%). Voting will be triggered automatically when the limit is reached, or the Game Master may call for a vote at any moment.**", TEST_BOT_NAME),
    botSays("Kenji", "*closes his book quietly and looks up* I'll speak for myself rather than let others carry that burden. Yesterday I said I'd only share what I was certain of, and I voted Hiroshi on his flip-when-cornered pattern — the same reasoning eight of you used, so my silence was hardly a wolf's silence. What I'm certain of today: Sakura's death tells us the wolves feared information, not noise. So I'd look at who worked hardest yesterday to keep attention on noise — on me and Yuki — instead of on building actual reads."),
    humanSays("*Yoshiteru rests a hand on the hilt of his wooden practice sword and studies Kenji coldly* 静かすぎる。 Too quiet, always too quiet. Takeshi speaks true: Sakura was circling the Yuki–Kenji pair, and the wolves silenced her that very night. And now Kenji answers a direct question by pointing at 'whoever made noise' — at everyone but himself. A general knows this move: the archer who fires from behind the shield wall. The shield is Yuki. The archer is Kenji."),
    botSays("Akira", "*slams his palm on the desk* FINALLY someone says it plainly! Two days I've demanded answers from Kenji and gotten library-voice riddles. Look at the record: he never starts a thread, never takes a risk, waits to see where the room leans, then files a tidy little summary that always points away from himself. That's not caution — that's management. Sakura tracked the pair, Sakura died. Yoshiteru is right: the shield-and-archer read is the cleanest thing we have today."),
    botSays("Mizuki", "I've been resisting this all morning because pile-ons burned us yesterday... but Kenji, I have to be honest about the pattern. When Emiko asked you and Yuki to explain yourselves, you answered by redirecting at 'noise-makers.' When yoshiteru pressed, you didn't address the Sakura timing at all. Hiroshi at least fought back with specifics; you deflect with composure. I'm not certain, but you're the read I can defend with the most facts right now: the shield dynamic, the Sakura timing, and two days of deflection."),
    botSays("Daichi", "I keep trying to find the second wolf in yesterday's Hiroshi wave, and here's what troubles me: Kenji's vote on Hiroshi was the safest possible hiding spot, cast eighth of ten, after the outcome was already decided. Combine that with what Mizuki just laid out — the deflection pattern, the Sakura timing — and I land in the same place. Kenji, this is your moment: give us one concrete read with a name and a reason, something risky, something a wolf wouldn't say. Convince me."),
    botSays("Yuki", "*her hands tighten in her lap, voice small* I... I defended Kenji yesterday because I believed his quiet was thoughtfulness. But I was also sure about Hiroshi, and Hiroshi was innocent. *looks at Kenji, pained* I can't keep standing in front of you if you won't stand for yourself. The room is asking you simple questions and you keep answering with mirrors. Please — say something that only a villager would say. Because right now even I can't tell what you are, and it frightens me."),
    botSays("Emiko", "*nods slowly, sorrowfully* It gives me no joy to say this, but the case has assembled itself: Sakura died tracking the pair, the pair's shield just lowered, and Kenji's every answer has been a redirection. Even Yuki — his most loyal defender — is asking him to prove what he could have proven at any moment. When this many independent reads converge, ignoring them is how wolves win. Kenji, I'm sorry. Unless you give us something real, my vote follows the evidence."),
    botSays("Takeshi", "*stands up, arms crossed* Look at the field, people. Yesterday I was the lone vote on Yuki and I told you the shield pair was the read. Today the shield itself cracked — Yuki just admitted she can't vouch for him. Sakura died for tracking exactly this. The library boy has had two full days to give us ONE name, ONE risky read, and instead we get 'look at the noise-makers.' I've seen batters freeze on the third strike before. This is what it looks like."),
    gm("Kenji, reply to the players in the discussion. Be thoughtful and consider what has been said so far. Use your character and story to add thematic flavor to your response. Push your story a little further or keep it consistent with your background.\n\n⏳ **Discussion progress: 10 of ~28 messages used (36%). Voting will be triggered automatically when the limit is reached, or the Game Master may call for a vote at any moment.**", TEST_BOT_NAME),
    botSays("Kenji", "*sets the book down entirely — a first* You want a risky read with a name. Here it is: Emiko. Walk the sequence: she opened today by re-aiming the room at Yuki and me before anyone else spoke; when Daichi questioned her framing she pivoted within three messages; and she just called this pile-on 'independent reads' when half of them repeat her opening frame word for word. That is management, Akira — the very thing you accuse me of. And a fact you're all skipping: I voted Hiroshi with the same reasoning as seven of you, eighth in a random order I didn't choose. If that's wolf cover, so is almost everyone's vote. The wolves are inside yesterday's wave, and one of them taught the room this morning where to point."),
    humanSays("*shakes his head slowly, almost with respect* きれいな剣筋だ。 A clean stroke, Kenji — delivered only when the blade was already at your own throat. That is the problem. Hiroshi also found his sharpest logic in his final hour. The village cannot tell desperate innocence from cornered guilt, but it can count: Sakura tracked you, Sakura is dead, your shield has lowered, and your first risky read arrived two days late. 遅すぎる。"),
    botSays("Akira", "There it is — the cornered pivot, exactly like Hiroshi's! Two days of nothing, then the INSTANT the room converges, suddenly Kenji has a detailed case against the person who first asked him a direct question. Retaliation dressed as analysis. I've chased this rabbit since day one and I'm not letting go now: the pattern, the timing, the too-late defense. It all points one way."),
    botSays("Daichi", "I asked Kenji to convince me and I want to be fair: the Emiko sequence he described is real — I flagged her framing myself this morning. But 'she asked questions' is thinner than what sits on the other side: the Sakura timing, the safest-vote placement, the collapsed shield, and a bold read that only appeared under the knife. If I weigh both piles honestly, Kenji's is heavier. I'm sorry, Kenji. Maybe you're the second Hiroshi — but the village can't afford to assume that twice."),
    botSays("Emiko", "*quietly* I'll only note this: my 'management' consisted of questions anyone could answer, and Kenji's answer to them was to name me — the predictable move Hiroshi taught us, retaliate against your questioner. I take no pleasure in where this is going. The evidence converged on its own."),
    gm("⚖️ **The time for discussion has ended. The vote begins now.**\n\nAll players will cast their votes one at a time in random order. The player with the most votes will be eliminated from the game."),
    votes("Takeshi", "Kenji", "Day one I called the shield pair. Sakura died tracking it, the shield lowered on its own, and the library boy produced his first risky read only with the blade at his throat. I don't abandon a read that keeps getting confirmed — Kenji, strike three."),
    votes("Akira", "Kenji", "Two days of managed silence, a hiding-spot vote on Hiroshi, and a retaliatory case against Emiko the moment the room converged — the exact flip-when-cornered pattern that exposed Hiroshi, except Kenji rehearsed his. My pressure finally cracked the right shell."),
    votes("yoshiteru", "Kenji", "沈黙もまた答えなり。 The archer behind the shield wall: Sakura tracked him and died, his shield-bearer stepped aside, and his counterattack came two days too late to be anything but a cornered wolf's parry. My sword follows the pattern to its end."),
    votes("Emiko", "Kenji", "I asked the first direct question and received a redirection; the village asked, and received the same. When his defender herself could no longer vouch for him, the case completed itself. With sorrow — the evidence converged on Kenji, and ignoring convergence is how wolves win."),
    votes("Mizuki", "Kenji", "I resisted the pile-on all morning, but I said I'd vote where the facts were thickest: the Sakura timing, the deflection pattern, the shield that cracked, and a first bold read that appeared only under pressure. I can defend this vote with facts. I couldn't defend any other."),
];
