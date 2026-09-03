/**
 * Framing geometry: a card on its sheet, the circle in the card, and the CSS
 * that shows exactly that part of the image.
 */

import { cardFocus, cardInCell, circleFocus, circleFocusOnSheet, defaultFraming, fitCard, fitCircle, fitFraming, focusToBackground, isFramingShape } from './avatar-framing';
import { CARD_ASPECT, DEFAULT_AVATAR_CIRCLE, MIN_CARD_HEIGHT_FRACTION } from '@/app/api/game-models';

describe('cardInCell', () => {
    it('takes the tallest 3:4 card, centered, top-anchored, in a landscape cell', () => {
        const card = cardInCell({ left: 600, top: 0, width: 600, height: 497 });
        expect(card).toEqual({ left: 714, top: 0, width: 372, height: 496 });
        expect(card.width / card.height).toBeCloseTo(CARD_ASPECT, 2);
    });

    it('is width-bound in a tall cell', () => {
        const card = cardInCell({ left: 0, top: 100, width: 300, height: 900 });
        expect(card).toEqual({ left: 0, top: 100, width: 300, height: 400 });
    });

    it('starts with the default circle', () => {
        expect(defaultFraming({ left: 0, top: 0, width: 300, height: 400 }).circle).toEqual(DEFAULT_AVATAR_CIRCLE);
    });
});

describe('fitCard / fitCircle', () => {
    const sheet = { width: 2400, height: 1792 };

    it('keeps a card inside the sheet and on aspect', () => {
        const card = fitCard({ left: 2300, top: 1700, width: 372, height: 496 }, sheet);
        expect(card.width).toBe(372);
        expect(card.height).toBe(496);
        expect(card.left + card.width).toBeLessThanOrEqual(sheet.width);
        expect(card.top + card.height).toBeLessThanOrEqual(sheet.height);
    });

    it('enforces the minimum card height', () => {
        const card = fitCard({ left: 0, top: 0, width: 30, height: 40 }, sheet);
        expect(card.height).toBe(Math.round(sheet.height * MIN_CARD_HEIGHT_FRACTION));
    });

    it('caps the card at what fits the sheet', () => {
        const card = fitCard({ left: 0, top: 0, width: 9000, height: 12000 }, sheet);
        expect(card.height).toBe(sheet.height);
        expect(card.width).toBe(Math.round(sheet.height * CARD_ASPECT));
    });

    it('keeps the circle inside the card', () => {
        expect(fitCircle({ x: 0.9, y: 0.9, d: 0.5 })).toEqual({ d: 0.5, x: 0.5, y: 1 - 0.5 * CARD_ASPECT });
        expect(fitCircle({ x: 0, y: 0, d: 2 }).d).toBe(1);
    });

    it('fits both halves at once', () => {
        const f = fitFraming({ card: { left: -50, top: -50, width: 300, height: 400 }, circle: { x: -1, y: -1, d: 0.5 } }, sheet);
        expect(f.card.left).toBe(0);
        expect(f.card.top).toBe(0);
        expect(f.circle).toEqual({ d: 0.5, x: 0, y: 0 });
    });
});

describe('isFramingShape', () => {
    it('accepts well-formed framings and rejects junk', () => {
        expect(isFramingShape({ card: { left: 0, top: 0, width: 1, height: 1 }, circle: { x: 0, y: 0, d: 0.5 } })).toBe(true);
        expect(isFramingShape({ card: { left: 0, top: 0, width: 0, height: 1 }, circle: { x: 0, y: 0, d: 0.5 } })).toBe(false);
        expect(isFramingShape({ card: { left: 'a', top: 0, width: 1, height: 1 }, circle: { x: 0, y: 0, d: 0.5 } })).toBe(false);
        expect(isFramingShape(null)).toBe(false);
        expect(isFramingShape({ circle: { x: 0, y: 0, d: 0.5 } })).toBe(false);
    });
});

describe('focus', () => {
    it('maps the circle onto the card image', () => {
        expect(circleFocus({ x: 0.14, y: 0.03, d: 0.72 })).toEqual({ x: 0.14, y: 0.03, w: 0.72, h: 0.54 });
    });

    it('maps the card onto its sheet', () => {
        expect(cardFocus({ left: 600, top: 0, width: 300, height: 400 }, { width: 1200, height: 800 })).toEqual({ x: 0.5, y: 0, w: 0.25, h: 0.5 });
    });

    it('composes the circle onto the sheet through the card', () => {
        const focus = circleFocusOnSheet({ card: { left: 600, top: 0, width: 300, height: 400 }, circle: { x: 0, y: 0, d: 1 } }, { width: 1200, height: 800 });
        // A full-width circle is a 300px square at the card's top-left.
        expect(focus).toEqual({ x: 0.5, y: 0, w: 0.25, h: 0.375 });
    });

    it('turns a focus into background-size/position that shows exactly it', () => {
        expect(focusToBackground({ x: 0.5, y: 0, w: 0.25, h: 0.5 })).toEqual({ backgroundSize: '400.000% 200.000%', backgroundPosition: '66.667% 0.000%' });
        // A whole-axis focus has no play: centered.
        expect(focusToBackground({ x: 0, y: 0, w: 1, h: 1 }).backgroundPosition).toBe('50.000% 50.000%');
    });
});
