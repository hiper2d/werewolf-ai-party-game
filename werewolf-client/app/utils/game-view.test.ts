import {Bot, Game, GAME_ROLES, GAME_STATES, GameMessage, MessageType} from '@/app/api/game-models';
import {HIDDEN_ROLE, viewGameAs, viewMessagesAs} from './game-view';

const bot = (name: string, role: string, isAlive = true): Bot => ({
    name, role, isAlive, story: '', aiType: 'x', gender: 'male', voice: 'v', playStyle: 'p',
    personalSummaries: [{day: 1, summary: `As the ${role} I…`}],
    roleKnowledge: {} as any,
});

const game = (over: Partial<Game> = {}): Game => ({
    id: 'g', humanPlayerName: 'Alex', humanPlayerRole: GAME_ROLES.VILLAGER, humanPlayerIsAlive: true,
    ownerEmail: 'a@b.c', gameState: GAME_STATES.DAY_DISCUSSION, currentDay: 1,
    gameStateProcessQueue: [], gameStateParamQueue: [],
    bots: [
        bot('Wolf1', GAME_ROLES.WEREWOLF), bot('Wolf2', GAME_ROLES.WEREWOLF),
        bot('Doc', GAME_ROLES.DOCTOR), bot('Det', GAME_ROLES.DETECTIVE),
        bot('Vil', GAME_ROLES.VILLAGER), bot('Gone', GAME_ROLES.VILLAGER, false),
    ],
    ...over,
} as Game);

const roles = (g: Game) => Object.fromEntries(g.bots.map(b => [b.name, b.role]));
const me = {name: 'Alex', host: true};
const guestSeat = {name: 'Alex', host: false};
// The real seal is a keyed hash; here it only has to change when the position does.
const sealed = new Map<string, string>();
const seal = (position: string) => sealed.get(position) ?? sealed.set(position, `t${sealed.size}`).get(position)!;

describe('viewGameAs', () => {
    it('a villager learns only the dead', () => {
        expect(roles(viewGameAs(game(), me, seal))).toEqual({
            Wolf1: HIDDEN_ROLE, Wolf2: HIDDEN_ROLE, Doc: HIDDEN_ROLE, Det: HIDDEN_ROLE,
            Vil: HIDDEN_ROLE, Gone: GAME_ROLES.VILLAGER,
        });
    });

    it('a werewolf also learns the pack, and nobody else', () => {
        const view = viewGameAs(game({humanPlayerRole: GAME_ROLES.WEREWOLF}), me, seal);
        expect(roles(view)).toMatchObject({
            Wolf1: GAME_ROLES.WEREWOLF, Wolf2: GAME_ROLES.WEREWOLF, Doc: HIDDEN_ROLE, Det: HIDDEN_ROLE,
        });
        expect(view.humanPlayerRole).toBe(GAME_ROLES.WEREWOLF);
    });

    it('everything is open once the game is over', () => {
        for (const gameState of [GAME_STATES.GAME_OVER, GAME_STATES.AFTER_GAME_DISCUSSION]) {
            const view = viewGameAs(game({gameState}), me, seal);
            expect(Object.values(roles(view))).not.toContain(HIDDEN_ROLE);
        }
    });

    it('somebody without a seat learns no living role, not even the human player\'s', () => {
        const view = viewGameAs(game({humanPlayerRole: GAME_ROLES.WEREWOLF}), null, seal);
        expect(roles(view).Wolf1).toBe(HIDDEN_ROLE);
        expect(view.humanPlayerRole).toBe(HIDDEN_ROLE);
    });

    it('never sends the list of seats: it carries the players\' accounts', () => {
        const seats = {u_1: {email: 'friend@example.com', character: 'Bo', payer: true, joinedAt: 1}};
        const view = viewGameAs(game({seats}), me, seal);
        expect(view.seats).toBeUndefined();
        expect(JSON.stringify(view)).not.toContain('friend@example.com');
    });

    it('never sends a bot\'s private notes, even when the role is known', () => {
        const view = viewGameAs(game({gameState: GAME_STATES.GAME_OVER}), me, seal);
        for (const b of view.bots) {
            expect(b).not.toHaveProperty('personalSummaries');
            expect(b).not.toHaveProperty('roleKnowledge');
        }
        expect(JSON.stringify(viewGameAs(game(), me, seal))).not.toContain('As the werewolf');
    });

    it('counts the roles that act at night without naming them', () => {
        // werewolf, doctor, detective; the villagers do nothing at night
        expect(viewGameAs(game(), me, seal).nightRoleTotal).toBe(3);
    });

    it('says when the vote result has decided the game', () => {
        const wolvesDead = game({
            gameState: GAME_STATES.VOTE_RESULTS,
            bots: [bot('Wolf1', GAME_ROLES.WEREWOLF, false), bot('Doc', GAME_ROLES.DOCTOR), bot('Vil', GAME_ROLES.VILLAGER)],
        });
        expect(viewGameAs(wolvesDead, me, seal).pendingGameOver).toBeTruthy();
        expect(viewGameAs(game({gameState: GAME_STATES.VOTE_RESULTS}), me, seal).pendingGameOver).toBeNull();
        // Only on a result screen: mid-discussion the page offers nothing.
        expect(viewGameAs({...wolvesDead, gameState: GAME_STATES.DAY_DISCUSSION}, me, seal).pendingGameOver).toBeNull();
    });

    it('applies the night\'s resolved deaths before counting the sides', () => {
        const night = game({
            gameState: GAME_STATES.NIGHT_RESULTS,
            bots: [bot('Wolf1', GAME_ROLES.WEREWOLF), bot('Doc', GAME_ROLES.DOCTOR), bot('Vil', GAME_ROLES.VILLAGER)],
            resolvedNightState: {
                deaths: [{player: 'Wolf1', role: GAME_ROLES.WEREWOLF, cause: 'doctor_kill'}],
                abductedPlayer: null, detectiveResult: null, actionsPrevented: [],
            },
        });
        expect(viewGameAs(night, me, seal).pendingGameOver).toBeTruthy();
        expect(viewGameAs({...night, resolvedNightState: {...night.resolvedNightState!, deaths: []}}, me, seal).pendingGameOver).toBeNull();
    });

    it('is not cut twice: a view counted again would see no werewolves', () => {
        const once = viewGameAs(game({gameState: GAME_STATES.VOTE_RESULTS}), me, seal);
        expect(viewGameAs(once, me, seal)).toBe(once);
    });

    it('leaves the stub of a deleted game alone', () => {
        const stub = {id: 'g', errorState: null} as Game;
        expect(viewGameAs(stub, me, seal)).toBe(stub);
    });
});

describe('the night, as one player sees it', () => {
    const night = (over: Partial<Game> = {}) => game({
        gameState: GAME_STATES.NIGHT,
        gameStateProcessQueue: [GAME_ROLES.WEREWOLF, GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE],
        gameStateParamQueue: ['Wolf1', 'Wolf2'],
        ...over,
    });

    it('another role acting: no role, no name, the length kept for the progress bar', () => {
        const view = viewGameAs(night(), me, seal);
        expect(view.gameStateProcessQueue).toEqual([HIDDEN_ROLE, HIDDEN_ROLE, HIDDEN_ROLE]);
        expect(view.gameStateParamQueue).toHaveLength(1);
        const text = JSON.stringify([view.gameStateProcessQueue, view.gameStateParamQueue]);
        for (const secret of ['Wolf1', 'Wolf2', 'werewolf', 'doctor', 'detective']) expect(text).not.toContain(secret);
    });

    it('the token changes with every step, so the page asks for the next one', () => {
        const first = viewGameAs(night(), me, seal).gameStateParamQueue[0];
        const secondWolf = viewGameAs(night({gameStateParamQueue: ['Wolf2']}), me, seal).gameStateParamQueue[0];
        const nextRole = viewGameAs(night({gameStateProcessQueue: [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE], gameStateParamQueue: ['Doc']}), me, seal).gameStateParamQueue[0];
        expect(new Set([first, secondWolf, nextRole]).size).toBe(3);
        expect(first.startsWith('#')).toBe(true); // never a player's name
    });

    it('the player\'s own turn is shown as it is, the roles after it stay blank', () => {
        const doctor = night({
            humanPlayerRole: GAME_ROLES.DOCTOR,
            gameStateProcessQueue: [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE],
            gameStateParamQueue: ['Alex'],
        });
        const view = viewGameAs(doctor, me, seal);
        expect(view.gameStateProcessQueue).toEqual([GAME_ROLES.DOCTOR, HIDDEN_ROLE]);
        expect(view.gameStateParamQueue).toEqual(['Alex']);
    });

    it('a werewolf sees the pack\'s order while the pack acts', () => {
        const wolf = night({humanPlayerRole: GAME_ROLES.WEREWOLF, gameStateParamQueue: ['Wolf1', 'Alex']});
        const view = viewGameAs(wolf, me, seal);
        expect(view.gameStateProcessQueue).toEqual([GAME_ROLES.WEREWOLF, HIDDEN_ROLE, HIDDEN_ROLE]);
        expect(view.gameStateParamQueue).toEqual(['Wolf1', 'Alex']);
    });

    it('queues of other phases hold public names and are left alone', () => {
        const vote = game({gameState: GAME_STATES.VOTE, gameStateProcessQueue: ['Doc', 'Alex'], gameStateParamQueue: []});
        expect(viewGameAs(vote, me, seal).gameStateProcessQueue).toEqual(['Doc', 'Alex']);
    });

    it('keeps the night\'s records on the server, except the player\'s own last choice', () => {
        const records = {
            nightResults: {werewolf: {target: 'Vil'}, doctor: {target: 'Det'}},
            previousNightResults: {werewolf: {target: 'Gone'}, doctor: {target: 'Alex'}},
            resolvedNightState: {deaths: [], abductedPlayer: null, detectiveResult: {target: 'Wolf1', isEvil: true, success: true}, actionsPrevented: []},
            oneTimeAbilitiesUsed: {doctorKill: true, detectiveKill: true},
        };
        const villager = viewGameAs(night(records), me, seal);
        expect(villager.nightResults).toEqual({});
        expect(villager.previousNightResults).toEqual({});
        expect(villager.resolvedNightState).toBeNull();
        expect(villager.oneTimeAbilitiesUsed).toEqual({});

        const doctor = viewGameAs(night({...records, humanPlayerRole: GAME_ROLES.DOCTOR}), me, seal);
        expect(doctor.previousNightResults).toEqual({doctor: {target: 'Alex'}});
        expect(doctor.oneTimeAbilitiesUsed).toEqual({doctorKill: true});
        expect(doctor.nightResults).toEqual({});
    });
});

describe('viewMessagesAs', () => {
    const message = (recipientName: string, msg: any = 'text', extra: Partial<GameMessage> = {}): GameMessage => ({
        id: `m-${recipientName}`, recipientName, authorName: 'Game Master', msg,
        messageType: MessageType.GM_COMMAND, day: 1, timestamp: 1, ...extra,
    });
    const all = [
        message('ALL'), message('Alex', 'text', {messageType: MessageType.GAME_STORY}), message('Doc'), message('WEREWOLVES'), message('DOCTOR'),
        message('DETECTIVE'), message('MANIAC'), message('NONE'),
    ];
    const recipients = (g: Game, viewer: typeof me | null) => viewMessagesAs(g, viewer, all).map(m => m.recipientName);

    it('a villager reads the table and what is addressed to them', () => {
        expect(recipients(game(), me)).toEqual(['ALL', 'Alex']);
    });

    it('each role also reads its own channel, and only its own', () => {
        expect(recipients(game({humanPlayerRole: GAME_ROLES.WEREWOLF}), me)).toEqual(['ALL', 'Alex', 'WEREWOLVES']);
        expect(recipients(game({humanPlayerRole: GAME_ROLES.DOCTOR}), me)).toEqual(['ALL', 'Alex', 'DOCTOR']);
        expect(recipients(game({humanPlayerRole: GAME_ROLES.DETECTIVE}), me)).toEqual(['ALL', 'Alex', 'DETECTIVE']);
        expect(recipients(game({humanPlayerRole: GAME_ROLES.MANIAC}), me)).toEqual(['ALL', 'Alex', 'MANIAC']);
    });

    it('somebody without a seat reads only the table', () => {
        expect(recipients(game({humanPlayerRole: GAME_ROLES.WEREWOLF}), null)).toEqual(['ALL']);
    });

    it('drops the model\'s thinking and the provider signatures, keeps the answer', () => {
        const answer = message('ALL', {
            reply: 'I say it was Vil.', thinking: 'As a werewolf I should blame Vil.',
            anthropicThinkingSignature: 'sig', openaiEncryptedReasoning: 'enc',
        }, {messageType: MessageType.BOT_ANSWER, turnTail: 'You are a werewolf.'});
        const [shown] = viewMessagesAs(game(), me, [answer]);
        expect(shown.msg).toEqual({reply: 'I say it was Vil.'});
        expect(JSON.stringify(shown)).not.toContain('werewolf');
        expect(answer.msg.thinking).toBeTruthy(); // the stored message is not touched
    });

    it('keeps a night action\'s own reasoning for the role that may read it', () => {
        const action = message('DOCTOR', {reasoning: 'Det looks exposed.', target: 'Det', thinking: 'hidden'});
        const [shown] = viewMessagesAs(game({humanPlayerRole: GAME_ROLES.DOCTOR}), me, [action]);
        expect(shown.msg).toEqual({reasoning: 'Det looks exposed.', target: 'Det'});
    });
});

describe('what only the host sees', () => {
    const running = () => game({
        gameMasterAiType: 'gpt-luna', totalGameCost: 1.25, totalImagesCost: 0.3,
        gameMasterTokenUsage: {inputTokens: 1} as any,
        providerBlocks: {google: {reason: 'refusal'}} as any,
        errorState: {error: 'Gemini refused', details: 'stack…', context: {model: 'gemini-flash', botName: 'Doc'}, recoverable: true, timestamp: 5},
        bots: [{...bot('Doc', GAME_ROLES.DOCTOR), aiType: 'gemini-flash', tokenUsage: {inputTokens: 9} as any}],
    });

    it('the host keeps models, costs and the full error', () => {
        const view = viewGameAs(running(), me, seal);
        expect(view.bots[0].aiType).toBe('gemini-flash');
        expect(view.totalGameCost).toBe(1.25);
        expect(view.errorState?.context.model).toBe('gemini-flash');
        expect(view.ownerEmail).toBe('a@b.c');
    });

    it('another player gets the table without the machinery', () => {
        const view = viewGameAs(running(), guestSeat, seal);
        const text = JSON.stringify(view);
        for (const secret of ['gemini-flash', 'gpt-luna', 'Gemini refused', 'stack…', 'a@b.c', '1.25']) expect(text).not.toContain(secret);
        expect(view.bots[0]).not.toHaveProperty('tokenUsage');
        // They still learn the game is stopped and whether a retry can help.
        expect(view.errorState).toMatchObject({recoverable: true, timestamp: 5});
        expect(view.bots[0].name).toBe('Doc');
    });

    it('a healthy game has no error for anybody', () => {
        expect(viewGameAs(game(), guestSeat, seal).errorState).toBeNull();
    });

    it('a line\'s cost goes to the host only', () => {
        const line = {id: 'm', recipientName: 'ALL', authorName: 'Doc', msg: 'hi', messageType: MessageType.BOT_ANSWER, day: 1, timestamp: 1, cost: 0.02} as GameMessage;
        expect(viewMessagesAs(game(), me, [line])[0].cost).toBe(0.02);
        expect(viewMessagesAs(game(), guestSeat, [line])[0]).not.toHaveProperty('cost');
    });
});

describe('a second human at the table', () => {
    const seats = {
        u1: {email: 'a@b.c', character: 'Alex', payer: true, joinedAt: 1},
        u2: {email: 'friend@b.c', character: 'Wolf2', payer: true, joinedAt: 2},
        u3: {email: 'third@b.c', character: 'Doc', payer: true, joinedAt: 3},
    };
    const shared = (over: Partial<Game> = {}) => game({seats, ...over});
    const wolf2 = {name: 'Wolf2', host: false};
    const doc = {name: 'Doc', host: false};

    it('sees the table from their own seat: they are the human player, the first human is in the cast', () => {
        const view = viewGameAs(shared(), wolf2, seal);
        expect(view.humanPlayerName).toBe('Wolf2');
        expect(view.humanPlayerRole).toBe(GAME_ROLES.WEREWOLF);
        expect(view.humanPlayerIsAlive).toBe(true);
        expect(view.bots.map(b => b.name)).toEqual(['Alex', 'Wolf1', 'Doc', 'Det', 'Vil', 'Gone']);
        expect(view.bots.find(b => b.name === 'Alex')).toMatchObject({human: true, role: HIDDEN_ROLE, isAlive: true});
    });

    it('learns roles by the same rules as anybody: the pack and the dead', () => {
        expect(roles(viewGameAs(shared(), wolf2, seal))).toEqual({
            Alex: HIDDEN_ROLE, Wolf1: GAME_ROLES.WEREWOLF, Doc: HIDDEN_ROLE, Det: HIDDEN_ROLE, Vil: HIDDEN_ROLE, Gone: GAME_ROLES.VILLAGER,
        });
        const asDoc = viewGameAs(shared(), doc, seal);
        expect(asDoc.humanPlayerRole).toBe(GAME_ROLES.DOCTOR);
        expect(roles(asDoc).Wolf2).toBe(HIDDEN_ROLE);
        // Two human werewolves know each other, whichever of them is the first human.
        const pack = viewGameAs(shared({humanPlayerRole: GAME_ROLES.WEREWOLF}), wolf2, seal);
        expect(roles(pack).Alex).toBe(GAME_ROLES.WEREWOLF);
    });

    it('is shown as a person to everybody, without a model, and their role stays hidden from the host', () => {
        const view = viewGameAs(shared(), me, seal);
        expect(view.humanPlayerName).toBe('Alex');
        expect(view.bots.find(b => b.name === 'Wolf2')).toMatchObject({human: true, aiType: '', role: HIDDEN_ROLE});
        expect(view.bots.find(b => b.name === 'Wolf1')).toMatchObject({aiType: 'x'});
        expect(view.bots.find(b => b.name === 'Wolf1')?.human).toBeUndefined();
    });

    it('carries their own death, and the first human\'s', () => {
        const dead = shared({
            humanPlayerIsAlive: false,
            bots: game().bots.map(b => b.name === 'Doc' ? {...b, isAlive: false} : b),
        });
        const asDoc = viewGameAs(dead, doc, seal);
        expect(asDoc.humanPlayerIsAlive).toBe(false);
        expect(asDoc.bots.find(b => b.name === 'Alex')).toMatchObject({isAlive: false, role: GAME_ROLES.VILLAGER});
    });

    it('reads their own role\'s channel and what is addressed to them, not the first human\'s', () => {
        const message = (recipientName: string) => ({id: recipientName, recipientName, authorName: 'GM', msg: 'x', messageType: MessageType.GM_COMMAND, day: 1, timestamp: 1} as GameMessage);
        const all = ['ALL', 'WEREWOLVES', 'DOCTOR', 'Wolf2', 'Alex', 'Wolf1'].map(message);
        // The command to 'Wolf2' was a prompt to the bot they took over: not theirs to read.
        expect(viewMessagesAs(shared(), wolf2, all).map(m => m.recipientName)).toEqual(['ALL', 'WEREWOLVES']);
        const note = {...message('Wolf2'), messageType: MessageType.GAME_STORY};
        expect(viewMessagesAs(shared(), wolf2, [note])).toHaveLength(1);
        expect(viewMessagesAs(shared(), doc, all).map(m => m.recipientName)).toEqual(['ALL', 'DOCTOR']);
    });

    it('sees the night queue only while their own role acts', () => {
        const night = shared({
            gameState: GAME_STATES.NIGHT,
            gameStateProcessQueue: [GAME_ROLES.WEREWOLF, GAME_ROLES.DOCTOR],
            gameStateParamQueue: ['Wolf1', 'Wolf2'],
        });
        expect(viewGameAs(night, wolf2, seal).gameStateParamQueue).toEqual(['Wolf1', 'Wolf2']);
        const asDoc = viewGameAs(night, doc, seal);
        expect(asDoc.gameStateProcessQueue).toEqual([HIDDEN_ROLE, HIDDEN_ROLE]);
        expect(asDoc.gameStateParamQueue[0].startsWith('#')).toBe(true);
    });

    it('a bot\'s name gives nobody its seat', () => {
        const view = viewGameAs(shared(), {name: 'Wolf1', host: false}, seal);
        expect(view.humanPlayerName).toBe('Alex');
        expect(view.humanPlayerRole).toBe(HIDDEN_ROLE);
        expect(roles(view).Wolf2).toBe(HIDDEN_ROLE);
    });
});
