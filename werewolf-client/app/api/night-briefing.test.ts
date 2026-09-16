import { buildNightRoleBriefing } from './night-briefing';
import { GAME_ROLES, ROLE_CONFIGS } from './game-models';

describe('buildNightRoleBriefing', () => {
    const briefing = buildNightRoleBriefing();

    it('lists every role that acts at night, in action order', () => {
        const order = ['Maniac', 'Werewolf', 'Doctor', 'Detective'];
        const listed = briefing.split('\n').map(line => line.replace(/^• /, '').split(':')[0]);
        expect(listed).toEqual(order);
    });

    it("tells players about the Doctor's one-time kill", () => {
        const line = briefing.split('\n').find(l => l.startsWith('• Doctor:'))!;
        expect(line).toContain('Once per game');
        expect(line).toContain(ROLE_CONFIGS[GAME_ROLES.DOCTOR].oneTimeAbilities!.kill.description);
    });

    it("tells players about the Detective's one-time kill", () => {
        const line = briefing.split('\n').find(l => l.startsWith('• Detective:'))!;
        expect(line).toContain('Once per game');
        expect(line).toContain(ROLE_CONFIGS[GAME_ROLES.DETECTIVE].oneTimeAbilities!.kill.description);
    });

    it('leaves roles without a one-time ability unchanged', () => {
        const line = briefing.split('\n').find(l => l.startsWith('• Werewolf:'))!;
        expect(line).not.toContain('Once per game');
        expect(line).toBe(`• Werewolf: ${ROLE_CONFIGS[GAME_ROLES.WEREWOLF].description}.`);
    });

    it('covers every one-time ability declared on a night role', () => {
        for (const config of Object.values(ROLE_CONFIGS)) {
            if (!config.hasNightAction) continue;
            for (const ability of Object.values(config.oneTimeAbilities ?? {})) {
                expect(briefing).toContain(ability.description);
            }
        }
    });
});
