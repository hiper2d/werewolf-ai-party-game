import {
    AvatarCircle,
    AvatarFraming,
    CARD_ASPECT,
    DEFAULT_AVATAR_CIRCLE,
    ImageRect,
    MIN_CARD_HEIGHT_FRACTION,
} from "@/app/api/game-models";

/**
 * Pure framing geometry, shared by the slicer (server), the reframe actions
 * (server validation) and the renderers/editor (browser). No I/O here.
 *
 * Coordinates: a card is an ImageRect in SHEET pixels (portrait 3:4); the
 * circle is card-relative (x, d = fractions of the card's width, y = fraction
 * of its height). An ImageFocus is what a renderer needs: the fraction of an
 * image to show, so the same PlayerAvatar can show a circle cut out of a
 * stored card OR out of the static mannequin sheet.
 */

/** The portion of an image to display, as fractions of its width/height. */
export interface ImageFocus {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface ImageSize {
    width: number;
    height: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Largest 3:4 card that fits a cell, centered horizontally and top-aligned:
 * portraits are busts with the head near the top, so the top edge is the
 * anchor that keeps the face in. */
export function cardInCell(cell: ImageRect): ImageRect {
    const width = Math.floor(Math.min(cell.width, cell.height * CARD_ASPECT));
    const height = Math.min(cell.height, Math.round(width / CARD_ASPECT));
    return {
        left: Math.round(cell.left + (cell.width - width) / 2),
        top: cell.top,
        width,
        height,
    };
}

export function defaultFraming(cell: ImageRect): AvatarFraming {
    return {card: cardInCell(cell), circle: {...DEFAULT_AVATAR_CIRCLE}};
}

/** Keeps the circle inside its card (same rule as the design's fitAvatar). */
export function fitCircle(circle: AvatarCircle): AvatarCircle {
    const d = clamp(circle.d, 0.15, 1);
    return {
        d,
        x: clamp(circle.x, 0, 1 - d),
        y: clamp(circle.y, 0, 1 - d * CARD_ASPECT),
    };
}

/** Snaps a card to a valid 3:4 rectangle inside the sheet, at least the
 * minimum size. Width is the free variable; height follows the aspect. */
export function fitCard(card: ImageRect, sheet: ImageSize): ImageRect {
    const minHeight = Math.max(16, Math.round(sheet.height * MIN_CARD_HEIGHT_FRACTION));
    const maxHeight = Math.min(sheet.height, sheet.width / CARD_ASPECT);
    const height = Math.round(clamp(card.height, minHeight, maxHeight));
    const width = Math.round(height * CARD_ASPECT);
    return {
        width,
        height,
        left: Math.round(clamp(card.left, 0, sheet.width - width)),
        top: Math.round(clamp(card.top, 0, sheet.height - height)),
    };
}

export function fitFraming(framing: AvatarFraming, sheet: ImageSize): AvatarFraming {
    return {card: fitCard(framing.card, sheet), circle: fitCircle(framing.circle)};
}

/** True when the framing is a well-formed object with finite numbers. Shape
 * only — call fitFraming for the geometric bounds. */
export function isFramingShape(value: unknown): value is AvatarFraming {
    if (!value || typeof value !== 'object') return false;
    const f = value as any;
    const rect = f.card, circle = f.circle;
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    return !!rect && !!circle
        && num(rect.left) && num(rect.top) && num(rect.width) && num(rect.height)
        && rect.width > 0 && rect.height > 0
        && num(circle.x) && num(circle.y) && num(circle.d) && circle.d > 0;
}

/** The circle as a focus on the CARD image itself (a stored card cut). */
export function circleFocus(circle: AvatarCircle): ImageFocus {
    const c = fitCircle(circle);
    return {x: c.x, y: c.y, w: c.d, h: c.d * CARD_ASPECT};
}

/** The card as a focus on its sheet. */
export function cardFocus(card: ImageRect, sheet: ImageSize): ImageFocus {
    return {
        x: card.left / sheet.width,
        y: card.top / sheet.height,
        w: card.width / sheet.width,
        h: card.height / sheet.height,
    };
}

/** The circle as a focus on the SHEET (card and circle composed) — how the
 * mannequin renders straight off the static preset sheet. */
export function circleFocusOnSheet(framing: AvatarFraming, sheet: ImageSize): ImageFocus {
    const c = fitCircle(framing.circle);
    const card = framing.card;
    const side = c.d * card.width; // the circle is square, in sheet px
    return {
        x: (card.left + c.x * card.width) / sheet.width,
        y: (card.top + c.y * card.height) / sheet.height,
        w: side / sheet.width,
        h: side / sheet.height,
    };
}

/** CSS `background-size` / `background-position` that shows exactly `focus`
 * of an image inside a box (the design's axis()/cardPreviewSize math). */
export function focusToBackground(focus: ImageFocus): {backgroundSize: string; backgroundPosition: string} {
    const axis = (pos: number, ext: number) => ext >= 1 ? 50 : (pos / (1 - ext)) * 100;
    return {
        backgroundSize: `${(100 / focus.w).toFixed(3)}% ${(100 / focus.h).toFixed(3)}%`,
        backgroundPosition: `${axis(focus.x, focus.w).toFixed(3)}% ${axis(focus.y, focus.h).toFixed(3)}%`,
    };
}
