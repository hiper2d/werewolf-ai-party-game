import {deviceMayMintGuest, guestEmailFor, guestTotalSpend, guestWallReached, isGuestBudgetError, isGuestEmail, isGuestWallError, GUEST_BUDGET_MESSAGE, GUEST_WALL_MESSAGE} from './guest';

const ID = '3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a90';
const DAY = 24 * 60 * 60 * 1000;

describe('guest identity', () => {
    it('round-trips the email it writes', () => {
        expect(isGuestEmail(guestEmailFor(ID))).toBe(true);
        expect(isGuestEmail(guestEmailFor(ID.toUpperCase()))).toBe(true);
    });

    it('rejects real accounts and look-alikes', () => {
        expect(isGuestEmail('someone@gmail.com')).toBe(false);
        expect(isGuestEmail(`guest-${ID}@guest.aiwerewolf.net.evil.com`)).toBe(false);
        expect(isGuestEmail('guest-123@guest.aiwerewolf.net')).toBe(false);
        expect(isGuestEmail(`x/guest-${ID}@guest.aiwerewolf.net`)).toBe(false);
        expect(isGuestEmail(undefined)).toBe(false);
        expect(isGuestEmail(null)).toBe(false);
    });
});

describe('guest wall', () => {
    it('lets day 1 and its night through and stops at day 2', () => {
        expect(guestWallReached({currentDay: 1})).toBe(false);
        expect(guestWallReached({})).toBe(false);
        expect(guestWallReached({currentDay: 2})).toBe(true);
    });

    it('recognizes its refusals after the string round trip', () => {
        expect(isGuestWallError(`Failed to start new day: ${GUEST_WALL_MESSAGE}`)).toBe(true);
        expect(isGuestWallError('Game not found')).toBe(false);
        expect(isGuestBudgetError(`x ${GUEST_BUDGET_MESSAGE}`)).toBe(true);
        expect(isGuestBudgetError(GUEST_WALL_MESSAGE)).toBe(false);
    });
});

describe('deviceMayMintGuest', () => {
    const now = 1_800_000_000_000;
    it('allows a device with no guest yet', () => {
        expect(deviceMayMintGuest(undefined, now, 1)).toBe(true);
    });
    it('refuses a second guest inside a day and allows one after it', () => {
        expect(deviceMayMintGuest(now - DAY + 1000, now, 1)).toBe(false);
        expect(deviceMayMintGuest(now - DAY, now, 1)).toBe(true);
    });
    it('is off at 0', () => {
        expect(deviceMayMintGuest(now - 1000, now, 0)).toBe(true);
    });
});

describe('guestTotalSpend', () => {
    it('sums the free spend of every month', () => {
        expect(guestTotalSpend([{period: '2026-11', freeAmountUSD: 0.4}, {period: '2026-12', freeAmountUSD: 0.25}])).toBeCloseTo(0.65);
    });
    it('reads legacy rows and junk as numbers', () => {
        expect(guestTotalSpend([{period: '2026-11', amountUSD: 0.3}, {}, null])).toBeCloseTo(0.3);
        expect(guestTotalSpend(undefined)).toBe(0);
    });
});
