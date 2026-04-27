// Chat page mock data — characters, messages, models
const PALETTES = [
  ['oklch(60% 0.18 25)', 'oklch(45% 0.18 25)'],   // red
  ['oklch(65% 0.16 60)', 'oklch(50% 0.16 60)'],   // orange
  ['oklch(70% 0.14 90)', 'oklch(55% 0.14 90)'],   // amber
  ['oklch(65% 0.14 145)', 'oklch(50% 0.14 145)'], // green
  ['oklch(63% 0.13 195)', 'oklch(48% 0.13 195)'], // teal
  ['oklch(60% 0.14 230)', 'oklch(45% 0.14 230)'], // blue
  ['oklch(58% 0.16 270)', 'oklch(42% 0.16 270)'], // indigo
  ['oklch(60% 0.18 310)', 'oklch(45% 0.18 310)'], // magenta
  ['oklch(63% 0.16 345)', 'oklch(48% 0.16 345)'], // pink
  ['oklch(58% 0.10 110)', 'oklch(45% 0.10 110)'], // olive
  ['oklch(62% 0.12 175)', 'oklch(48% 0.12 175)'], // cyan
  ['oklch(58% 0.14 290)', 'oklch(42% 0.14 290)'], // violet
];
function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function avatarStyle(name) {
  const [a, b] = PALETTES[hashName(name) % PALETTES.length];
  return { background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` };
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Roles: 'gm' | 'villager' | 'werewolf' | 'doctor' | 'detective' | 'maniac'
// `you.role` is the role the human player knows about themselves.
// Other participants' `role` is the TRUE role; visibility to the player is decided in the UI:
//   - GM is always visible
//   - Your own role is visible
//   - If you are a werewolf, fellow werewolves are visible
//   - Dead players have their roles revealed
const PARTICIPANTS = [
  { id: 'gm',       name: 'Game Master', model: 'Kimi K2 Turbo',                  cost: 0.0059, role: 'gm' },
  { id: 'luna',     name: 'Luna',        model: null,                              cost: 0,      role: 'werewolf', you: true },
  { id: 'harry',    name: 'Harry',       model: 'Grok 4.1 Fast Reasoning',         cost: 0.0024, role: 'villager' },
  { id: 'hermione', name: 'Hermione',    model: 'DeepSeek V4 Flash',               cost: 0.0015, role: 'detective' },
  { id: 'ron',      name: 'Ron',         model: 'DeepSeek V4 Flash (Thinking)',    cost: 0.0017, role: 'villager' },
  { id: 'draco',    name: 'Draco',       model: 'GPT-5.4-mini',                    cost: 0.0056, role: 'werewolf', dead: true, deathNight: 1, deathCause: 'killed' },
  { id: 'ginny',    name: 'Ginny',       model: 'Kimi K2 Turbo',                   cost: 0.0120, role: 'villager' },
  { id: 'neville',  name: 'Neville',     model: 'Kimi K2 Turbo (Thinking)',        cost: 0.0357, role: 'doctor' },
  { id: 'snape',    name: 'Snape',       model: 'Claude 4.5 Haiku (Thinking)',     cost: 0.0084, role: 'werewolf' },
  { id: 'minerva',  name: 'Minerva',     model: 'Claude 4.5 Haiku',                cost: 0.0068, role: 'maniac',   dead: true, deathDay: 1, deathCause: 'lynched' },
  { id: 'fred',     name: 'Fred',        model: 'Gemini 3 Flash Preview',          cost: 0.0061, role: 'villager' },
  { id: 'cho',      name: 'Cho',         model: 'Grok 4.1 Fast Reasoning',         cost: 0.0027, role: 'villager' },
  { id: 'hagrid',   name: 'Hagrid',      model: 'GPT-5.4-mini',                    cost: 0.0139, role: 'villager' },
];

const MESSAGES = [
  {
    id: 'm1', authorId: 'gm', cost: 0.0059,
    text: "Hogwarts' torch-lit Great Hall has become a deadly tribunal: three hidden werewolves prowl among the students and staff, while a vigilant doctor, a sharp detective, and a secretive maniac struggle to shield the school from the coming slaughter. With only trust and suspicion to guide them, the eleven souls must vote to expel the beasts before night returns and the pack claims another life; when darkness falls, three sets of fangs will strike and the survivors must unmask the wolves before their numbers match the innocent.",
  },
  {
    id: 'm2', authorId: 'harry', cost: 0.0009,
    text: "Fellow students and staff, it's Harry Potter here—the Boy Who Lived, though these days my scar throbs with a restless warning of fangs in the shadows. I've been patrolling Hogwarts' corridors nightly, wand gripped tight, but on the last full moon, I slipped into the Forbidden Forest chasing whispers of howls, returning with gashes that heal too slowly and raise questions even from me. Let's watch each other's backs and uncover these beasts before they strike again.",
  },
  {
    id: 'm3', authorId: 'hermione', cost: 0.0006,
    text: "Harry, your scar is a convenient distraction from the fact that you've been sneaking into the Forbidden Forest alone—conveniently on full moons, when werewolves are strongest. I've been brewing Wolfsbane potions and cross-referencing Polyjuice ingredients with lunar cycles, and your 'gashes' heal too slowly? That sounds like a deliberate performance. Perhaps you're the very beast you claim to hunt—or you're covering for one. Either way, I'll be watching your every move.",
  },
  {
    id: 'm4', authorId: 'ron', cost: 0.0010,
    text: "Hermione, my theory's got teeth, but I'm not flashing 'em until I see who's really hunting tonight. Maybe the missing medical supplies tell a better story: who'd steal Wolfsbane? Wolves don't need it, but a Doctor covering their tracks might. Ginny, could you see anything about the figure's robes or height? Even a glimpse helps.",
  },
  {
    id: 'm5', authorId: 'ginny', cost: 0.0069,
    text: "Didn't see robes—just shadows moving toward the hospital wing. *grips broom tighter* The scraping sounds came after. Like claws on stone, not wood. Whoever took them knew the castle layout. Not a student wandering lost.",
  },
  {
    id: 'm6', authorId: 'neville', cost: 0.0195,
    text: "Luna, being quiet doesn't make you useless—it makes you easy prey for a mob looking for simple targets. Hermione, you've thrown accusations at Harry, Ron, and now Luna before most of us have spoken; that's the kind of pressure that breaks villagers, not wolves. Ginny, those medical supplies you saw moving toward the hospital wing matter more than theories—I've been harvesting moonseed and wolfsbane myself, and that quantity suggests someone preparing for more than just curriculum. Let's not let the beasts watch us turn on each other.",
  },
  {
    id: 'm7', authorId: 'fred', cost: 0.0033,
    text: "Hermione, your rapid-fire accusations are making my hair stand on end—and not in the fun, electrified way. I was suspicious of Harry's wounds, but now I'm wondering if the Doctor is the one moving those supplies Ginny saw to frame someone else. Luna, don't play the victim just yet; I have a feeling you've seen more than you're letting on with those Spectrespecs.",
  },
  {
    id: 'm8', authorId: 'cho', cost: 0.0014,
    text: "*clutches silver mirror closer, gaze flickering toward silent observers like Luna and me—fair, as prophecies of stillness, not clamor. Ginny's shadows moving medical supplies to mirror's latest reflections of furtive figures under moonlight, not random wanderings. I'll watch those patterns closely before words multiply suspicions.*",
  },
  {
    id: 'm9', authorId: 'hagrid', cost: 0.0074,
    text: "*Hagrid lets out a slow huff, one big hand resting on Fang's head as he looks round the Great Hall.* Luna, you're not useless, and I'd stop anyone sayin' that in my hearing—quiet's not the same thing as careless, and some creatures are at their strongest when they're overlooked. As for the rest of it, Ginny's seeing supplies move toward the hospital wing feels like the kind o' detail worth keepin' an eye on, and Hermione's push for names is understandable, though I'd rather we don't let panic do the wolves' work for 'em. I'm with Neville on this one: the castle's full of shadows, but the first thing to catch my attention is always who's moving quietly and who's trying to stir the whole nest at once.",
  },
];

const MODELS = [
  { provider: 'Anthropic', items: [
    { id: 'claude-4.7-opus', name: 'Claude 4.7 Opus' },
    { id: 'claude-4.7-opus-thinking', name: 'Claude 4.7 Opus (Thinking)', tags: ['thinking'] },
    { id: 'claude-4.6-sonnet', name: 'Claude 4.6 Sonnet' },
    { id: 'claude-4.6-sonnet-thinking', name: 'Claude 4.6 Sonnet (Thinking)', tags: ['thinking'] },
    { id: 'claude-4.5-haiku', name: 'Claude 4.5 Haiku', tags: ['fast'] },
    { id: 'claude-4.5-haiku-thinking', name: 'Claude 4.5 Haiku (Thinking)', tags: ['fast', 'thinking'] },
  ]},
  { provider: 'DeepSeek', items: [
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', tags: ['fast'] },
    { id: 'deepseek-v4-flash-thinking', name: 'DeepSeek V4 Flash (Thinking)', tags: ['fast', 'thinking'] },
  ]},
  { provider: 'OpenAI', items: [
    { id: 'gpt-5.4-mini', name: 'GPT-5.4-mini', tags: ['fast'] },
    { id: 'gpt-5.4', name: 'GPT-5.4' },
  ]},
  { provider: 'Google', items: [
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash Preview', tags: ['fast'] },
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro' },
  ]},
  { provider: 'xAI', items: [
    { id: 'grok-4.1-fast', name: 'Grok 4.1 Fast Reasoning', tags: ['fast', 'thinking'] },
  ]},
  { provider: 'Moonshot', items: [
    { id: 'kimi-k2-turbo', name: 'Kimi K2 Turbo', tags: ['fast'] },
    { id: 'kimi-k2-turbo-thinking', name: 'Kimi K2 Turbo (Thinking)', tags: ['fast', 'thinking'] },
  ]},
];

// Decide whether the current player should see a participant's role tag.
// Visible when: it's you, it's the GM, the player is dead, OR you and the player share the werewolf team.
function getRoleVisibility(p, viewer) {
  if (!p) return { visible: false };
  if (p.role === 'gm') return { visible: false }; // GM gets its own treatment, not a role tag
  if (p.dead) return { visible: true, reason: 'dead' };
  if (p.you || (viewer && viewer.id === p.id)) return { visible: true, reason: 'self' };
  if (viewer && viewer.role === 'werewolf' && p.role === 'werewolf') {
    return { visible: true, reason: 'fellow-wolf' };
  }
  return { visible: false };
}

Object.assign(window, { PARTICIPANTS, MESSAGES, MODELS, avatarStyle, initials, hashName, getRoleVisibility });
