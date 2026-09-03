import {ImageRect} from "@/app/api/game-models";

/**
 * Finds the cells of a drawn portrait sheet from its pixels.
 *
 * The prompt asks for equal cells separated by thin dark divider lines, but
 * the model draws the lines where it likes: on a correctly drawn 4x4 sheet
 * the rows measured 497 / 485 / 428 / 382 px where equal splits assumed 448
 * (2026-09-02), so fixed-interval slicing cut lower rows through the previous
 * character's chest. The lines themselves are crisp — near-black across the
 * full width — so they are easy to find, and the cells between them are the
 * real ones. Columns have always measured exact; rows drift.
 *
 * Pure over a greyscale byte plane so it is testable without sharp.
 */

export interface GreyPlane {
    width: number;
    height: number;
    // width*height bytes, row-major, 0 = black.
    data: Uint8Array;
}

export interface SheetGrid {
    cells: ImageRect[]; // row-major
    cols: number;
    rows: number;
    // false = dividers didn't match the request and this is the equal split
    detected: boolean;
}

// A pixel darker than this is "line"; a scanline with more than this share
// of dark pixels is a divider. Cell backgrounds are flat muted colours, well
// above the threshold, and the dark portrait clothing never spans a full line.
const DARK_MAX = 60;
const DIVIDER_SHARE = 0.85;
// Pixels kept clear of a divider when cutting (anti-aliased edges).
const DIVIDER_INSET = 4;
// A real divider is a thin line (~7 px on a 2400 px sheet). A dark run thicker
// than this is a dark art style's background, not a boundary — treating it as
// one would carve cells out of the wrong places, so such a sheet falls back to
// the equal split instead.
const DIVIDER_MAX_THICKNESS = 24;

interface Run { start: number; end: number }

function runs(indices: number[]): Run[] {
    const out: Run[] = [];
    for (const i of indices) {
        const last = out[out.length - 1];
        if (last && i === last.end + 1) last.end = i;
        else out.push({start: i, end: i});
    }
    return out;
}

/** Divider runs across the plane, excluding the ones touching the border
 * (the sheet's frame line, not a cell boundary). */
export function findDividers(plane: GreyPlane): {rows: Run[]; cols: Run[]} {
    const {width, height, data} = plane;
    const darkRows: number[] = [];
    for (let y = 0; y < height; y++) {
        let dark = 0;
        const base = y * width;
        for (let x = 0; x < width; x++) if (data[base + x] < DARK_MAX) dark++;
        if (dark / width > DIVIDER_SHARE) darkRows.push(y);
    }
    const darkCols: number[] = [];
    for (let x = 0; x < width; x++) {
        let dark = 0;
        for (let y = 0; y < height; y++) if (data[y * width + x] < DARK_MAX) dark++;
        if (dark / height > DIVIDER_SHARE) darkCols.push(x);
    }
    const internal = (all: Run[], extent: number) => all.filter(r => r.start > 2 && r.end < extent - 3);
    const thin = (all: Run[]) => all.filter(r => r.end - r.start + 1 <= DIVIDER_MAX_THICKNESS);
    return {rows: thin(internal(runs(darkRows), height)), cols: thin(internal(runs(darkCols), width))};
}

/** Cells between dividers along one axis, from the border to the first line,
 * line to line, last line to the border. */
function spans(dividers: Run[], extent: number): {start: number; end: number}[] {
    const out: {start: number; end: number}[] = [];
    let cursor = 0;
    for (const d of dividers) {
        out.push({start: cursor, end: d.start});
        cursor = d.end + 1;
    }
    out.push({start: cursor, end: extent});
    return out;
}

export function equalSplitGrid(width: number, height: number, cols: number, rows: number): SheetGrid {
    const cellW = Math.floor(width / cols), cellH = Math.floor(height / rows);
    const cells: ImageRect[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            cells.push(inset({left: c * cellW, top: r * cellH, width: cellW, height: cellH}, 8));
        }
    }
    return {cells, cols, rows, detected: false};
}

function inset(rect: ImageRect, by: number): ImageRect {
    return {left: rect.left + by, top: rect.top + by, width: Math.max(1, rect.width - 2 * by), height: Math.max(1, rect.height - 2 * by)};
}

/**
 * The sheet's cells for a requested cols x rows grid. Detected from the
 * divider lines when they agree with the request; otherwise the equal split
 * (the caller logs the mismatch — a sheet drawn with fewer rows than asked is
 * the known failure, and the kept sheet lets the owner reframe by hand).
 */
export function detectSheetGrid(plane: GreyPlane, cols: number, rows: number): SheetGrid {
    const {width, height} = plane;
    const dividers = findDividers(plane);
    if (dividers.cols.length !== cols - 1 || dividers.rows.length !== rows - 1) {
        return equalSplitGrid(width, height, cols, rows);
    }
    const xs = spans(dividers.cols, width);
    const ys = spans(dividers.rows, height);
    const cells: ImageRect[] = [];
    for (const y of ys) {
        for (const x of xs) {
            cells.push(inset({left: x.start, top: y.start, width: x.end - x.start, height: y.end - y.start}, DIVIDER_INSET));
        }
    }
    // A "cell" thinner than a face means the lines were something else.
    const tooSmall = cells.some(c => c.width < 80 || c.height < 80);
    if (tooSmall) return equalSplitGrid(width, height, cols, rows);
    return {cells, cols, rows, detected: true};
}

/** What findDividers saw, for the mismatch log line. */
export function describeDividers(plane: GreyPlane): string {
    const d = findDividers(plane);
    const fmt = (r: Run[]) => r.map(x => `${x.start}-${x.end}`).join(',') || 'none';
    return `rows@${fmt(d.rows)} cols@${fmt(d.cols)}`;
}
