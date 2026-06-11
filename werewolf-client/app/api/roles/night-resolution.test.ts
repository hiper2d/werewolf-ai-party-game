/**
 * Unit tests for night-action resolution logic.
 *
 * Covers RoleProcessorFactory.resolveNightState / processor ordering and the
 * pure state-computation parts of the four role processors
 * (computeIntermediateNightState). LLM-calling code paths (processNightAction
 * agent calls) are intentionally NOT exercised — all network-touching modules
 * are mocked out.
 */

// ---------------------------------------------------------------------------
// Mocks for transitive imports that touch Firebase / auth / AI SDKs.
// Must be declared before importing the processors.
// ---------------------------------------------------------------------------
jest.mock("@/firebase/server", () => ({
    db: {}
}));

jest.mock("@/auth", () => ({
    auth: jest.fn()
}));

jest.mock("@/app/api/game-actions", () => ({
    addMessageToChatAndSaveToDb: jest.fn().mockImplementation(async (message: any) => message),
    getBotMessages: jest.fn().mockResolvedValue([]),
    getUserFromFirestore: jest.fn()
}));

jest.mock("@/app/utils/tier-utils", () => ({
    getApiKeysForUser: jest.fn()
}));

jest.mock("@/app/api/cost-tracking", () => ({
    recordBotTokenUsage: jest.fn()
}));

jest.mock("@/app/ai/agent-factory", () => ({
    AgentFactory: {
        createAgent: jest.fn()
    }
}));

// Importing the index registers all role processors with the factory (side effect).
import "./index";
import { RoleProcessorFactory } from "./role-processor-factory";
import { WerewolfProcessor } from "./werewolf-processor";
import { DoctorProcessor } from "./doctor-processor";
import { DetectiveProcessor } from "./detective-processor";
import { ManiacProcessor } from "./maniac-processor";
import { NightState } from "./base-role-processor";
import { Bot, Game, GAME_ROLES } from "@/app/api/game-models";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const GAME_ID = "test-game-id";

function makeBot(name: string, role: string, overrides: Partial<Bot> = {}): Bot {
    return {
        name,
        story: `${name}'s story`,
        role,
        isAlive: true,
        aiType: "test-model",
        gender: "male",
        voice: "test-voice",
        playStyle: "normal",
        ...overrides
    };
}

/**
 * Default cast:
 *  - Wolfgang: werewolf
 *  - Dora:     doctor
 *  - Sherlock: detective
 *  - Mandy:    maniac
 *  - Vicky:    villager
 *  - Hero:     human villager
 */
function makeGame(overrides: Partial<Game> = {}): Game {
    return {
        id: GAME_ID,
        description: "test game",
        theme: "test",
        werewolfCount: 1,
        specialRoles: [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE, GAME_ROLES.MANIAC],
        gameMasterAiType: "test-model",
        gameMasterVoice: "gm-voice",
        story: "story",
        bots: [
            makeBot("Wolfgang", GAME_ROLES.WEREWOLF),
            makeBot("Dora", GAME_ROLES.DOCTOR, { gender: "female" }),
            makeBot("Sherlock", GAME_ROLES.DETECTIVE),
            makeBot("Mandy", GAME_ROLES.MANIAC, { gender: "female" }),
            makeBot("Vicky", GAME_ROLES.VILLAGER, { gender: "female" })
        ],
        humanPlayerName: "Hero",
        humanPlayerRole: GAME_ROLES.VILLAGER,
        currentDay: 2,
        gameState: "NIGHT",
        gameStateParamQueue: [],
        gameStateProcessQueue: [],
        ownerEmail: "test@example.com",
        createdWithTier: "free",
        nightResults: {},
        ...overrides
    } as Game;
}

function emptyState(): NightState {
    return { deaths: [], abductedPlayer: null, detectiveResult: null, actionsPrevented: [] };
}

function resolve(game: Game, stopBeforeRole?: string): NightState {
    return RoleProcessorFactory.resolveNightState(GAME_ID, game, stopBeforeRole);
}

beforeAll(() => {
    // Silence the very chatty night-action logging.
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Factory: processor registration and ordering
// ---------------------------------------------------------------------------

describe("RoleProcessorFactory ordering and registration", () => {
    it("orders night-acting roles Maniac → Werewolf → Doctor → Detective", () => {
        expect(RoleProcessorFactory.getRolesWithNightActions()).toEqual([
            GAME_ROLES.MANIAC,
            GAME_ROLES.WEREWOLF,
            GAME_ROLES.DOCTOR,
            GAME_ROLES.DETECTIVE
        ]);
    });

    it("reports hasNightActions correctly per role", () => {
        expect(RoleProcessorFactory.hasNightActions(GAME_ROLES.MANIAC)).toBe(true);
        expect(RoleProcessorFactory.hasNightActions(GAME_ROLES.WEREWOLF)).toBe(true);
        expect(RoleProcessorFactory.hasNightActions(GAME_ROLES.DOCTOR)).toBe(true);
        expect(RoleProcessorFactory.hasNightActions(GAME_ROLES.DETECTIVE)).toBe(true);
        expect(RoleProcessorFactory.hasNightActions(GAME_ROLES.VILLAGER)).toBe(false);
        expect(RoleProcessorFactory.hasNightActions("no-such-role")).toBe(false);
    });

    it("has a registered processor for each night-acting role", () => {
        for (const role of RoleProcessorFactory.getRolesWithNightActions()) {
            expect(RoleProcessorFactory.hasProcessor(role)).toBe(true);
        }
        expect(RoleProcessorFactory.hasProcessor(GAME_ROLES.VILLAGER)).toBe(false);
    });

    it("creates processor instances of the right class, and null for villager/unknown", () => {
        const game = makeGame();
        expect(RoleProcessorFactory.createProcessor(GAME_ROLES.WEREWOLF, GAME_ID, game)).toBeInstanceOf(WerewolfProcessor);
        expect(RoleProcessorFactory.createProcessor(GAME_ROLES.DOCTOR, GAME_ID, game)).toBeInstanceOf(DoctorProcessor);
        expect(RoleProcessorFactory.createProcessor(GAME_ROLES.DETECTIVE, GAME_ID, game)).toBeInstanceOf(DetectiveProcessor);
        expect(RoleProcessorFactory.createProcessor(GAME_ROLES.MANIAC, GAME_ID, game)).toBeInstanceOf(ManiacProcessor);
        expect(RoleProcessorFactory.createProcessor(GAME_ROLES.VILLAGER, GAME_ID, game)).toBeNull();
        expect(RoleProcessorFactory.createProcessor("no-such-role", GAME_ID, game)).toBeNull();
    });

    it("applies actions in documented order regardless of nightResults key insertion order", () => {
        // Keys inserted in REVERSE of the action order. The pipeline must still
        // run maniac → werewolf → doctor → detective:
        //  - werewolf kill of Hero is saved by the doctor (doctor runs after werewolf)
        //  - maniac abduction of Vicky is visible to all later roles
        const nightResults: Record<string, any> = {};
        nightResults[GAME_ROLES.DETECTIVE] = { target: "Wolfgang", actionType: "investigate" };
        nightResults[GAME_ROLES.DOCTOR] = { target: "Hero", actionType: "protect" };
        nightResults[GAME_ROLES.WEREWOLF] = { target: "Hero" };
        nightResults[GAME_ROLES.MANIAC] = { target: "Vicky" };

        const state = resolve(makeGame({ nightResults }));

        expect(state.deaths).toEqual([]); // Hero saved — doctor must have run AFTER werewolf
        expect(state.abductedPlayer).toBe("Vicky");
        expect(state.detectiveResult).toEqual({ target: "Wolfgang", isEvil: true, success: true });
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.WEREWOLF, reason: "doctor_save", player: null }
        ]);
    });

    it("maniac runs first even when its key is inserted last (abduction blocks the werewolf attack)", () => {
        const nightResults: Record<string, any> = {};
        nightResults[GAME_ROLES.WEREWOLF] = { target: "Vicky" };
        nightResults[GAME_ROLES.MANIAC] = { target: "Vicky" };

        const state = resolve(makeGame({ nightResults }));

        expect(state.deaths).toEqual([]);
        expect(state.abductedPlayer).toBe("Vicky");
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.WEREWOLF, reason: "abduction", player: null }
        ]);
    });

    it("returns an empty state when there are no night results", () => {
        expect(resolve(makeGame({ nightResults: {} }))).toEqual(emptyState());
        expect(resolve(makeGame({ nightResults: undefined }))).toEqual(emptyState());
    });

    describe("stopBeforeRole", () => {
        const nightResults = {
            [GAME_ROLES.MANIAC]: { target: "Sherlock" },
            [GAME_ROLES.WEREWOLF]: { target: "Vicky" },
            [GAME_ROLES.DOCTOR]: { target: "Vicky", actionType: "protect" }
        };

        it("stopping before doctor shows the werewolf kill that the doctor would undo", () => {
            const state = resolve(makeGame({ nightResults }), GAME_ROLES.DOCTOR);
            expect(state.deaths).toEqual([
                { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "werewolf_attack" }
            ]);
            expect(state.abductedPlayer).toBe("Sherlock");
        });

        it("stopping before werewolf shows only the abduction", () => {
            const state = resolve(makeGame({ nightResults }), GAME_ROLES.WEREWOLF);
            expect(state.deaths).toEqual([]);
            expect(state.abductedPlayer).toBe("Sherlock");
        });

        it("running the full pipeline applies the doctor save", () => {
            const state = resolve(makeGame({ nightResults }));
            expect(state.deaths).toEqual([]);
            expect(state.actionsPrevented).toEqual([
                { role: GAME_ROLES.WEREWOLF, reason: "doctor_save", player: null }
            ]);
        });
    });
});

// ---------------------------------------------------------------------------
// Werewolf resolution
// ---------------------------------------------------------------------------

describe("Werewolf night resolution", () => {
    it("records a werewolf kill with the victim's role", () => {
        const state = resolve(makeGame({
            nightResults: { [GAME_ROLES.WEREWOLF]: { target: "Vicky" } }
        }));
        expect(state.deaths).toEqual([
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "werewolf_attack" }
        ]);
        expect(state.actionsPrevented).toEqual([]);
    });

    it("is a no-op when no werewolf target was chosen", () => {
        const game = makeGame();
        const processor = new WerewolfProcessor(GAME_ID, game);
        const state = processor.computeIntermediateNightState({ werewolf: {} }, emptyState());
        expect(state).toEqual(emptyState());
    });

    it("kills the human player using humanPlayerRole for the role", () => {
        const state = resolve(makeGame({
            humanPlayerRole: GAME_ROLES.DETECTIVE,
            nightResults: { [GAME_ROLES.WEREWOLF]: { target: "Hero" } }
        }));
        expect(state.deaths).toEqual([
            { player: "Hero", role: GAME_ROLES.DETECTIVE, cause: "werewolf_attack" }
        ]);
    });

    it("pins current behavior: kill is recorded even if the target bot is already dead", () => {
        // computeIntermediateNightState performs no aliveness check —
        // upstream target validation is responsible for this.
        const game = makeGame();
        game.bots.find(b => b.name === "Vicky")!.isAlive = false;
        const state = resolve(makeGame({
            bots: game.bots,
            nightResults: { [GAME_ROLES.WEREWOLF]: { target: "Vicky" } }
        }));
        expect(state.deaths).toEqual([
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "werewolf_attack" }
        ]);
    });
});

// ---------------------------------------------------------------------------
// Maniac abduction
// ---------------------------------------------------------------------------

describe("Maniac abduction", () => {
    it("sets abductedPlayer from night results", () => {
        const state = resolve(makeGame({
            nightResults: { [GAME_ROLES.MANIAC]: { target: "Dora" } }
        }));
        expect(state.abductedPlayer).toBe("Dora");
        expect(state.deaths).toEqual([]);
    });

    it("leaves abductedPlayer null when maniac has no target", () => {
        const processor = new ManiacProcessor(GAME_ID, makeGame());
        const state = processor.computeIntermediateNightState({ maniac: {} }, emptyState());
        expect(state.abductedPlayer).toBeNull();
    });

    it("protects the abductee from the werewolf attack (attack prevented, no death)", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Hero" },
                [GAME_ROLES.WEREWOLF]: { target: "Hero" }
            }
        }));
        expect(state.deaths).toEqual([]);
        expect(state.abductedPlayer).toBe("Hero");
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.WEREWOLF, reason: "abduction", player: null }
        ]);
    });

    it("blocks the doctor's protection of an abducted player (the werewolf kill elsewhere stands)", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Vicky" },
                [GAME_ROLES.WEREWOLF]: { target: "Sherlock" },
                [GAME_ROLES.DOCTOR]: { target: "Vicky", actionType: "protect" }
            }
        }));
        expect(state.abductedPlayer).toBe("Vicky");
        expect(state.deaths).toEqual([
            { player: "Sherlock", role: GAME_ROLES.DETECTIVE, cause: "werewolf_attack" }
        ]);
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.DOCTOR, reason: "abduction", player: null }
        ]);
    });

    it("blocks the doctor's KILL on an abducted player", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Vicky" },
                [GAME_ROLES.DOCTOR]: { target: "Vicky", actionType: "kill" }
            }
        }));
        expect(state.deaths).toEqual([]);
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.DOCTOR, reason: "abduction", player: null }
        ]);
    });

    it("blocks the detective's investigation of an abducted player (pins: detectiveResult stays null)", () => {
        // NOTE: the DetectiveResult interface documents `success: false if
        // blocked by abduction`, but the implementation never produces such a
        // result — it simply leaves detectiveResult null. Pinned here.
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Wolfgang" },
                [GAME_ROLES.DETECTIVE]: { target: "Wolfgang", actionType: "investigate" }
            }
        }));
        expect(state.detectiveResult).toBeNull();
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.DETECTIVE, reason: "abduction", player: null }
        ]);
    });
});

// ---------------------------------------------------------------------------
// Doctor resolution
// ---------------------------------------------------------------------------

describe("Doctor night resolution", () => {
    it("saves the werewolf target (target survives)", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.WEREWOLF]: { target: "Hero" },
                [GAME_ROLES.DOCTOR]: { target: "Hero", actionType: "protect" }
            }
        }));
        expect(state.deaths).toEqual([]);
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.WEREWOLF, reason: "doctor_save", player: null }
        ]);
    });

    it("defaults a missing actionType to protect", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.WEREWOLF]: { target: "Vicky" },
                [GAME_ROLES.DOCTOR]: { target: "Vicky" } // no actionType
            }
        }));
        expect(state.deaths).toEqual([]);
    });

    it("protecting a non-targeted player has no effect (kill stands)", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.WEREWOLF]: { target: "Vicky" },
                [GAME_ROLES.DOCTOR]: { target: "Hero", actionType: "protect" }
            }
        }));
        expect(state.deaths).toEqual([
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "werewolf_attack" }
        ]);
        expect(state.actionsPrevented).toEqual([]);
    });

    it("doctor's one-time kill adds a doctor_kill death", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.DOCTOR]: { target: "Wolfgang", actionType: "kill" }
            }
        }));
        expect(state.deaths).toEqual([
            { player: "Wolfgang", role: GAME_ROLES.WEREWOLF, cause: "doctor_kill" }
        ]);
    });

    it("doctor protection does NOT undo a doctor kill (only werewolf_attack deaths are removable)", () => {
        // Direct processor call: a doctor_kill death is already in state;
        // a protect on the same player leaves it untouched.
        const processor = new DoctorProcessor(GAME_ID, makeGame());
        const state = emptyState();
        state.deaths.push({ player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "doctor_kill" });
        processor.computeIntermediateNightState(
            { doctor: { target: "Vicky", actionType: "protect" } },
            state
        );
        expect(state.deaths).toEqual([
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "doctor_kill" }
        ]);
        expect(state.actionsPrevented).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Death cascade: maniac dies while holding an abductee
// ---------------------------------------------------------------------------

describe("Death cascade (maniac dies while holding an abductee)", () => {
    it("werewolves kill the maniac → abductee dies as maniac_collateral", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Vicky" },
                [GAME_ROLES.WEREWOLF]: { target: "Mandy" }
            }
        }));
        expect(state.deaths).toEqual([
            { player: "Mandy", role: GAME_ROLES.MANIAC, cause: "werewolf_attack" },
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "maniac_collateral" }
        ]);
        expect(state.abductedPlayer).toBe("Vicky");
    });

    it("werewolves kill the maniac with no abductee → single death, no cascade", () => {
        const state = resolve(makeGame({
            nightResults: { [GAME_ROLES.WEREWOLF]: { target: "Mandy" } }
        }));
        expect(state.deaths).toEqual([
            { player: "Mandy", role: GAME_ROLES.MANIAC, cause: "werewolf_attack" }
        ]);
    });

    it("doctor's kill on the maniac also cascades to the abductee", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Hero" },
                [GAME_ROLES.DOCTOR]: { target: "Mandy", actionType: "kill" }
            }
        }));
        expect(state.deaths).toEqual([
            { player: "Mandy", role: GAME_ROLES.MANIAC, cause: "doctor_kill" },
            { player: "Hero", role: GAME_ROLES.VILLAGER, cause: "maniac_collateral" }
        ]);
    });

    it("detective's kill on the maniac also cascades to the abductee", () => {
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Dora" },
                [GAME_ROLES.DETECTIVE]: { target: "Mandy", actionType: "kill" }
            }
        }));
        expect(state.deaths).toEqual([
            { player: "Mandy", role: GAME_ROLES.MANIAC, cause: "detective_kill" },
            { player: "Dora", role: GAME_ROLES.DOCTOR, cause: "maniac_collateral" }
        ]);
        // Detective still gets a result entry for the kill (reads maniac as evil)
        expect(state.detectiveResult).toEqual({ target: "Mandy", isEvil: true, success: true });
    });

    it("pins current behavior: doctor saving the maniac does NOT undo the abductee's collateral death", () => {
        // SUSPECTED BUG: the werewolf processor adds the collateral death
        // together with the maniac's death, but the doctor's save only removes
        // the werewolf_attack death — the abductee stays dead even though the
        // maniac survives the night.
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.MANIAC]: { target: "Vicky" },
                [GAME_ROLES.WEREWOLF]: { target: "Mandy" },
                [GAME_ROLES.DOCTOR]: { target: "Mandy", actionType: "protect" }
            }
        }));
        // Maniac survives...
        expect(state.deaths.some(d => d.player === "Mandy")).toBe(false);
        // ...but the abductee's collateral death is still there.
        expect(state.deaths).toEqual([
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "maniac_collateral" }
        ]);
        expect(state.actionsPrevented).toEqual([
            { role: GAME_ROLES.WEREWOLF, reason: "doctor_save", player: null }
        ]);
    });
});

// ---------------------------------------------------------------------------
// Detective resolution
// ---------------------------------------------------------------------------

describe("Detective night resolution", () => {
    it("investigating a werewolf reads as evil", () => {
        const state = resolve(makeGame({
            nightResults: { [GAME_ROLES.DETECTIVE]: { target: "Wolfgang", actionType: "investigate" } }
        }));
        expect(state.detectiveResult).toEqual({ target: "Wolfgang", isEvil: true, success: true });
        expect(state.deaths).toEqual([]);
    });

    it("investigating the maniac also reads as evil (detective can't distinguish)", () => {
        const state = resolve(makeGame({
            nightResults: { [GAME_ROLES.DETECTIVE]: { target: "Mandy", actionType: "investigate" } }
        }));
        expect(state.detectiveResult).toEqual({ target: "Mandy", isEvil: true, success: true });
    });

    it("investigating villager/doctor reads as innocent", () => {
        const villagerState = resolve(makeGame({
            nightResults: { [GAME_ROLES.DETECTIVE]: { target: "Vicky" } } // default actionType
        }));
        expect(villagerState.detectiveResult).toEqual({ target: "Vicky", isEvil: false, success: true });

        const doctorState = resolve(makeGame({
            nightResults: { [GAME_ROLES.DETECTIVE]: { target: "Dora", actionType: "investigate" } }
        }));
        expect(doctorState.detectiveResult).toEqual({ target: "Dora", isEvil: false, success: true });
    });

    it("investigating the human player resolves via humanPlayerRole", () => {
        const state = resolve(makeGame({
            humanPlayerRole: GAME_ROLES.WEREWOLF,
            nightResults: { [GAME_ROLES.DETECTIVE]: { target: "Hero", actionType: "investigate" } }
        }));
        expect(state.detectiveResult).toEqual({ target: "Hero", isEvil: true, success: true });
    });

    it("pins current behavior: investigating an unknown name yields role 'unknown' → innocent", () => {
        const state = resolve(makeGame({
            nightResults: { [GAME_ROLES.DETECTIVE]: { target: "Nobody", actionType: "investigate" } }
        }));
        expect(state.detectiveResult).toEqual({ target: "Nobody", isEvil: false, success: true });
    });

    it("detective's one-time kill adds a detective_kill death and sets a result for the victim", () => {
        const state = resolve(makeGame({
            nightResults: { [GAME_ROLES.DETECTIVE]: { target: "Vicky", actionType: "kill" } }
        }));
        expect(state.deaths).toEqual([
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "detective_kill" }
        ]);
        expect(state.detectiveResult).toEqual({ target: "Vicky", isEvil: false, success: true });
    });

    it("pins current behavior: investigating a player who dies tonight still succeeds", () => {
        // No death-check in computeIntermediateNightState — the detective gets
        // a normal result even though the target is dying the same night.
        const state = resolve(makeGame({
            nightResults: {
                [GAME_ROLES.WEREWOLF]: { target: "Vicky" },
                [GAME_ROLES.DETECTIVE]: { target: "Vicky", actionType: "investigate" }
            }
        }));
        expect(state.deaths).toEqual([
            { player: "Vicky", role: GAME_ROLES.VILLAGER, cause: "werewolf_attack" }
        ]);
        expect(state.detectiveResult).toEqual({ target: "Vicky", isEvil: false, success: true });
    });

    it("is a no-op when detective did not act", () => {
        const processor = new DetectiveProcessor(GAME_ID, makeGame());
        const state = processor.computeIntermediateNightState({}, emptyState());
        expect(state).toEqual(emptyState());
    });
});

// ---------------------------------------------------------------------------
// init() queue filtering (uses preState; messaging is mocked)
// ---------------------------------------------------------------------------

describe("BaseRoleProcessor.init queue filtering", () => {
    let randomSpy: jest.SpyInstance;

    beforeEach(() => {
        // Make the shuffle comparator always return 0 → stable, deterministic order
        randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    });

    afterEach(() => {
        randomSpy.mockRestore();
    });

    it("removes an abducted detective from the queue", async () => {
        const processor = new DetectiveProcessor(GAME_ID, makeGame());
        const preState = emptyState();
        preState.abductedPlayer = "Sherlock";
        const result = await processor.init(preState);
        expect(result.success).toBe(true);
        expect(result.paramQueue).toEqual([]);
    });

    it("removes a detective who is dying tonight from the queue", async () => {
        const processor = new DetectiveProcessor(GAME_ID, makeGame());
        const preState = emptyState();
        preState.deaths.push({ player: "Sherlock", role: GAME_ROLES.DETECTIVE, cause: "werewolf_attack" });
        const result = await processor.init(preState);
        expect(result.paramQueue).toEqual([]);
    });

    it("keeps a doctor in the queue even if they are dying tonight (self-save allowed)", async () => {
        const processor = new DoctorProcessor(GAME_ID, makeGame());
        const preState = emptyState();
        preState.deaths.push({ player: "Dora", role: GAME_ROLES.DOCTOR, cause: "werewolf_attack" });
        const result = await processor.init(preState);
        expect(result.paramQueue).toEqual(["Dora"]);
    });

    it("removes an abducted doctor from the queue", async () => {
        const processor = new DoctorProcessor(GAME_ID, makeGame());
        const preState = emptyState();
        preState.abductedPlayer = "Dora";
        const result = await processor.init(preState);
        expect(result.paramQueue).toEqual([]);
    });

    it("keeps an abducted werewolf in the queue (pack discussion still allowed)", async () => {
        const game = makeGame();
        game.bots.push(makeBot("Lupin", GAME_ROLES.WEREWOLF));
        const processor = new WerewolfProcessor(GAME_ID, game);
        const preState = emptyState();
        preState.abductedPlayer = "Wolfgang";
        const result = await processor.init(preState);
        // Both wolves remain; queue is duplicated for the coordination phase
        expect(result.paramQueue.sort()).toEqual(["Lupin", "Lupin", "Wolfgang", "Wolfgang"]);
    });

    it("duplicates the werewolf queue only when more than one werewolf is alive", async () => {
        const processor = new WerewolfProcessor(GAME_ID, makeGame());
        const result = await processor.init(emptyState());
        expect(result.paramQueue).toEqual(["Wolfgang"]);
    });

    it("returns an empty queue when no player has the role", async () => {
        const game = makeGame();
        game.bots = game.bots.filter(b => b.role !== GAME_ROLES.MANIAC);
        const processor = new ManiacProcessor(GAME_ID, game);
        const result = await processor.init(emptyState());
        expect(result.success).toBe(true);
        expect(result.paramQueue).toEqual([]);
    });
});
