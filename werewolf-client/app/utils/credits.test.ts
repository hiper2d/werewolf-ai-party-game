import {
    CREDITS_SPENT_MESSAGE, CreditEvidence, creditsAfterSpend, decideSignupCredit, EMPTY_CREDIT_EVIDENCE, handleStem,
    isCreditsSpentError, isGenericMachine, MACHINE_ONLY_WINDOW_MS, makeClaimCode, normalizeClaimCode,
} from './credits';
import {freeSpendLimitMessage, freeSpendLimitScope, isFreeSpendLimitError} from '@/app/api/errors';
import {canOpenGameOnTier} from './tier-access';

const NOW = Date.UTC(2026, 10, 25, 12);
const evidence = (over: Partial<CreditEvidence>): CreditEvidence => ({...EMPTY_CREDIT_EVIDENCE, ...over});

describe('decideSignupCredit', () => {
    it('grants when nothing points at another account', () => {
        expect(decideSignupCredit(EMPTY_CREDIT_EVIDENCE, NOW)).toEqual({action: 'grant', rules: [], linked: []});
    });

    it('denies a second account on the same browser', () => {
        const decision = decideSignupCredit(evidence({sameDevice: ['first@example.com']}), NOW);
        expect(decision).toEqual({action: 'deny', rules: ['device'], linked: ['first@example.com']});
    });

    it('denies when the machine and the IP both match (a private window at home)', () => {
        const decision = decideSignupCredit(evidence({sameMachine: ['a@example.com'], machineSeenAt: NOW - 30 * 86_400_000, sameIp: ['a@example.com']}), NOW);
        expect(decision.action).toBe('deny');
        expect(decision.rules).toEqual(['machine+ip']);
        expect(decision.linked).toEqual(['a@example.com']);
    });

    it('denies a numbered sibling name together with a second sign', () => {
        expect(decideSignupCredit(evidence({siblings: ['reqaccv4@gmail.com'], sameIp: ['reqaccv4@gmail.com']}), NOW).rules).toEqual(['ip+handle']);
        expect(decideSignupCredit(evidence({siblings: ['reqaccv4@gmail.com'], sameMachine: ['x@example.com'], machineSeenAt: NOW}), NOW).rules).toEqual(['machine+handle']);
    });

    it('denies a machine-only match on a specific machine seen within 72 hours (new browser profile on a VPN)', () => {
        const recent = evidence({sameMachine: ['a@example.com'], machineGeneric: false, machineSeenAt: NOW - MACHINE_ONLY_WINDOW_MS + 1000});
        expect(decideSignupCredit(recent, NOW)).toEqual({action: 'deny', rules: ['machine'], linked: ['a@example.com']});
    });

    it('only flags a machine-only match that is old, or on a machine many people share', () => {
        const old = evidence({sameMachine: ['a@example.com'], machineGeneric: false, machineSeenAt: NOW - MACHINE_ONLY_WINDOW_MS - 1000});
        expect(decideSignupCredit(old, NOW).action).toBe('flag');
        const macbook = evidence({sameMachine: ['a@example.com'], machineGeneric: true, machineSeenAt: NOW});
        expect(decideSignupCredit(macbook, NOW)).toEqual({action: 'flag', rules: ['machine'], linked: ['a@example.com']});
    });

    it('only flags one weak sign alone: a shared IP, a sibling name', () => {
        expect(decideSignupCredit(evidence({sameIp: ['roommate@example.com']}), NOW)).toEqual({action: 'flag', rules: ['ip'], linked: ['roommate@example.com']});
        expect(decideSignupCredit(evidence({siblings: ['maria1987@example.com']}), NOW)).toEqual({action: 'flag', rules: ['handle'], linked: ['maria1987@example.com']});
    });
});

describe('isGenericMachine', () => {
    it('treats Apple hardware, phones and hidden graphics cards as shared by many people', () => {
        expect(isGenericMachine({glRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'})).toBe(true);
        expect(isGenericMachine({glRenderer: 'Apple GPU'})).toBe(true);
        expect(isGenericMachine({glRenderer: 'Adreno (TM) 740', mobile: true})).toBe(true);
        expect(isGenericMachine({glRenderer: 'NVIDIA GeForce RTX 3060', touchPoints: 5})).toBe(true);
        expect(isGenericMachine({glRenderer: 'Brave'})).toBe(true);
        expect(isGenericMachine({})).toBe(true);
        expect(isGenericMachine(null)).toBe(true);
    });

    it('treats a desktop with a named graphics card as specific', () => {
        expect(isGenericMachine({glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', touchPoints: 0, mobile: false})).toBe(false);
        expect(isGenericMachine({glRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'})).toBe(false);
    });
});

describe('handleStem', () => {
    it('strips the trailing number, Gmail dots and +tags', () => {
        expect(handleStem('reqaccv4@gmail.com')).toBe('reqaccv');
        expect(handleStem('Req.Acc.V12+x@gmail.com')).toBe('reqaccv');
        expect(handleStem('maria.garcia1990@outlook.com')).toBe('maria.garcia');
    });

    it('is null without a trailing number or with too short a name', () => {
        expect(handleStem('alice@example.com')).toBeNull();
        expect(handleStem('john12@example.com')).toBeNull();
        expect(handleStem('12345@example.com')).toBeNull();
        expect(handleStem('not-an-email')).toBeNull();
        expect(handleStem(undefined)).toBeNull();
    });
});

describe('claim codes', () => {
    it('makes a code that normalizes to itself', () => {
        let i = 0;
        const code = makeClaimCode(max => (i++ * 7) % max);
        expect(code).toMatch(/^WOLF-[A-Z2-9]{8}$/);
        expect(normalizeClaimCode(code)).toBe(code);
    });

    it('accepts what a player types: lower case, spaces, no prefix', () => {
        expect(normalizeClaimCode(' wolf-7kq2 m9xa ')).toBe('WOLF-7KQ2M9XA');
        expect(normalizeClaimCode('7KQ2M9XA')).toBe('WOLF-7KQ2M9XA');
    });

    it('rejects anything that cannot be a code', () => {
        expect(normalizeClaimCode('WOLF-123')).toBeNull();
        expect(normalizeClaimCode('WOLF-7KQ2M9X0')).toBeNull(); // 0 is not in the alphabet
        expect(normalizeClaimCode('')).toBeNull();
        expect(normalizeClaimCode(42)).toBeNull();
        expect(normalizeClaimCode('users/someone@example.com')).toBeNull();
    });
});

describe('credits spent', () => {
    it('stops at zero and keeps six decimals', () => {
        expect(creditsAfterSpend(5, 0.123456789)).toBe(4.876543);
        expect(creditsAfterSpend(0.01, 0.5)).toBe(0);
    });

    it('is recognised as a spend refusal with its own scope', () => {
        const message = freeSpendLimitMessage({window: 'month', limitUSD: 5}, 'credits');
        expect(message).toBe(CREDITS_SPENT_MESSAGE);
        expect(isCreditsSpentError(`Failed: ${message}`)).toBe(true);
        expect(isFreeSpendLimitError(message)).toBe(true);
        expect(freeSpendLimitScope(message)).toBe('credits');
        expect(freeSpendLimitScope("You've used today's free $5 of AI. Come back after midnight UTC.")).toBe('account');
    });
});

describe('canOpenGameOnTier', () => {
    it('opens a game on its own tier, and a free game for a paid account', () => {
        expect(canOpenGameOnTier('free', 'free')).toBe(true);
        expect(canOpenGameOnTier('paid', 'paid')).toBe(true);
        expect(canOpenGameOnTier('free', 'paid')).toBe(true);
        expect(canOpenGameOnTier('api', 'paid')).toBe(true);
    });

    it('keeps a paid game closed to a free account', () => {
        expect(canOpenGameOnTier('paid', 'free')).toBe(false);
        expect(canOpenGameOnTier('paid', undefined)).toBe(false);
    });
});
