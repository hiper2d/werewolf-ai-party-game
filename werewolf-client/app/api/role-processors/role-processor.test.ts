import { Game, GAME_STATES } from '../game-models';
import { createRoleProcessor } from './role-processor-factory';
import { WerewolfProcessor } from './werewolf-processor';
import { DoctorProcessor } from './doctor-processor';
import { DetectiveProcessor } from './detective-processor';

// Mock the dependencies
jest.mock('@/firebase/server', () => ({
    db: {
        collection: jest.fn().mockReturnValue({
            doc: jest.fn().mockReturnValue({
                update: jest.fn().mockResolvedValue(undefined)
            })
        })
    }
}));

jest.mock('@/app/ai/agent-factory', () => ({
    getAiAgent: jest.fn().mockResolvedValue({
        getSchemaResponse: jest.fn().mockResolvedValue('{"reply": "Test werewolf discussion"}')
    })
}));

describe('Role Processor Factory', () => {
    const mockGameId = 'test-game-id';
    const mockUserEmail = 'test@example.com';

    test('creates werewolf processor', () => {
        const processor = createRoleProcessor('werewolf', mockGameId, mockUserEmail);
        expect(processor).toBeInstanceOf(WerewolfProcessor);
    });

    test('creates doctor processor', () => {
        const processor = createRoleProcessor('doctor', mockGameId, mockUserEmail);
        expect(processor).toBeInstanceOf(DoctorProcessor);
    });

    test('creates detective processor', () => {
        const processor = createRoleProcessor('detective', mockGameId, mockUserEmail);
        expect(processor).toBeInstanceOf(DetectiveProcessor);
    });

    test('throws error for unknown role', () => {
        expect(() => {
            createRoleProcessor('unknown', mockGameId, mockUserEmail);
        }).toThrow('Unknown role: unknown');
    });
});

describe('Role Processor Base Functionality', () => {
    const mockGameId = 'test-game-id';
    const mockUserEmail = 'test@example.com';

    const createMockGame = (): Game => ({
        id: mockGameId,
        description: 'Test game',
        theme: 'Test theme',
        werewolfCount: 1,
        specialRoles: ['doctor', 'detective'],
        gameMasterAiType: 'gpt-4',
        story: 'Test story',
        bots: [
            { name: 'Alice', story: 'Alice story', role: 'werewolf', isAlive: true, aiType: 'gpt-4' },
            { name: 'Bob', story: 'Bob story', role: 'doctor', isAlive: true, aiType: 'gpt-4' },
            { name: 'Charlie', story: 'Charlie story', role: 'villager', isAlive: true, aiType: 'gpt-4' }
        ],
        humanPlayerName: 'David',
        humanPlayerRole: 'detective',
        currentDay: 1,
        gameState: GAME_STATES.NIGHT_ACTION,
        gameStateParamQueue: [],
        gameStateProcessQueue: ['werewolf', 'doctor', 'detective'],
        currentNightRole: 'werewolf'
    });

    test('werewolf processor identifies active werewolf players', async () => {
        const game = createMockGame();
        const processor = createRoleProcessor('werewolf', mockGameId, mockUserEmail);
        
        // Test with bot werewolf
        const hasActivePlayersBot = (processor as any).hasActivePlayers(game, 'werewolf');
        expect(hasActivePlayersBot).toBe(true);
        
        // Test with human werewolf
        game.humanPlayerRole = 'werewolf';
        const hasActivePlayersHuman = (processor as any).hasActivePlayers(game, 'werewolf');
        expect(hasActivePlayersHuman).toBe(true);
        
        // Test with no werewolves
        game.humanPlayerRole = 'detective';
        game.bots[0].role = 'villager';
        const hasActivePlayersNone = (processor as any).hasActivePlayers(game, 'werewolf');
        expect(hasActivePlayersNone).toBe(false);
    });

    test('doctor processor identifies active doctor players', async () => {
        const game = createMockGame();
        const processor = createRoleProcessor('doctor', mockGameId, mockUserEmail);
        
        // Test with bot doctor
        const hasActivePlayersBot = (processor as any).hasActivePlayers(game, 'doctor');
        expect(hasActivePlayersBot).toBe(true);
        
        // Test with human doctor
        game.humanPlayerRole = 'doctor';
        const hasActivePlayersHuman = (processor as any).hasActivePlayers(game, 'doctor');
        expect(hasActivePlayersHuman).toBe(true);
    });

    test('detective processor identifies active detective players', async () => {
        const game = createMockGame();
        const processor = createRoleProcessor('detective', mockGameId, mockUserEmail);
        
        // Test with human detective (default in mock)
        const hasActivePlayersHuman = (processor as any).hasActivePlayers(game, 'detective');
        expect(hasActivePlayersHuman).toBe(true);
        
        // Test with bot detective
        game.humanPlayerRole = 'villager';
        game.bots.push({ name: 'Eve', story: 'Eve story', role: 'detective', isAlive: true, aiType: 'gpt-4' });
        const hasActivePlayersBot = (processor as any).hasActivePlayers(game, 'detective');
        expect(hasActivePlayersBot).toBe(true);
    });

    test('gets players with specific role', async () => {
        const game = createMockGame();
        const processor = createRoleProcessor('werewolf', mockGameId, mockUserEmail);
        
        // Test werewolf players (bot only)
        const werewolves = (processor as any).getPlayersWithRole(game, 'werewolf');
        expect(werewolves).toEqual(['Alice']);
        
        // Test detective players (human only)
        const detectives = (processor as any).getPlayersWithRole(game, 'detective');
        expect(detectives).toEqual(['David']);
        
        // Test doctor players (bot only)
        const doctors = (processor as any).getPlayersWithRole(game, 'doctor');
        expect(doctors).toEqual(['Bob']);
        
        // Test villagers (bot only)
        const villagers = (processor as any).getPlayersWithRole(game, 'villager');
        expect(villagers).toEqual(['Charlie']);
    });

    test('handles dead players correctly', async () => {
        const game = createMockGame();
        game.bots[0].isAlive = false; // Kill Alice (werewolf)
        
        const processor = createRoleProcessor('werewolf', mockGameId, mockUserEmail);
        
        // Should not include dead players
        const werewolves = (processor as any).getPlayersWithRole(game, 'werewolf');
        expect(werewolves).toEqual([]);
        
        const hasActivePlayers = (processor as any).hasActivePlayers(game, 'werewolf');
        expect(hasActivePlayers).toBe(false);
    });
});