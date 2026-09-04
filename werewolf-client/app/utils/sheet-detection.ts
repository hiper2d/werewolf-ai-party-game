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
    // false = no usable divider lines were found and this is the equal split
    // of the REQUESTED grid. true = the cells between the lines the model
    // actually drew, which may be a different grid than requested (a 4x4
    // request has come back as 4x3 and as 6x3) — the sheet is the truth.
    detected: boolean;
}

// A pixel darker than this is "line"; a scanline with more than this share
// of dark pixels is a divider. Cell backgrounds are flat muted colours, well
// above the threshold, and the dark portrait clothing never spans a full line.
const DARK_MAX = 60;
const DIVIDER_SHARE = 0.85;
// Pixels kept clear of a divider when cutting (anti-aliased edges).
const DIVIDER_INSET = 4;
// A real divider is a thin line (~7 px on a 2400 px sheet). Thinner runs are
// specks (a dark hairline inside a hooded figure once passed as a row line).
// Thicker runs up to a small share of the sheet are still boundaries: the
// model sometimes adds a dark name plate under each portrait despite the
// no-text rule, and the plate belongs OUTSIDE the cell. Beyond that share a
// dark run is a dark art style's background, not a boundary.
const DIVIDER_MIN_THICKNESS = 3;
const DIVIDER_MAX_THICKNESS_SHARE = 0.08;
// A span between lines narrower than this share of the sheet can't hold a
// face; the line that would create it is not a cell boundary.
const MIN_SPAN_SHARE = 0.12;

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

/** Dark runs along one axis, measured over a window of the other axis (a
 * band of rows for columns, the full height by default). Border runs and
 * runs that aren't line-shaped are dropped. */
function lineRuns(plane: GreyPlane, axis: 'rows' | 'cols', from: number, to: number): Run[] {
    const {width, height, data} = plane;
    const extent = axis === 'rows' ? height : width;
    const dark: number[] = [];
    for (let i = 0; i < extent; i++) {
        let count = 0;
        if (axis === 'rows') {
            const base = i * width;
            for (let x = from; x < to; x++) if (data[base + x] < DARK_MAX) count++;
        } else {
            for (let y = from; y < to; y++) if (data[y * width + i] < DARK_MAX) count++;
        }
        if (count / (to - from) > DIVIDER_SHARE) dark.push(i);
    }
    const maxThickness = extent * DIVIDER_MAX_THICKNESS_SHARE;
    return runs(dark)
        .filter(r => r.start > 2 && r.end < extent - 3)
        .filter(r => { const t = r.end - r.start + 1; return t >= DIVIDER_MIN_THICKNESS && t <= maxThickness; });
}

/** Lines that would leave a sliver on either side are not boundaries. */
function dropSliverMakers(lines: Run[], extent: number): Run[] {
    const minSpan = extent * MIN_SPAN_SHARE;
    const kept: Run[] = [];
    let cursor = 0;
    for (const line of lines) {
        if (line.start - cursor < minSpan || extent - (line.end + 1) < minSpan) continue;
        kept.push(line);
        cursor = line.end + 1;
    }
    return kept;
}

/** Divider runs across the whole plane: row lines over the full width,
 * column lines over the full height. */
export function findDividers(plane: GreyPlane): {rows: Run[]; cols: Run[]} {
    return {
        rows: dropSliverMakers(lineRuns(plane, 'rows', 0, plane.width), plane.height),
        cols: dropSliverMakers(lineRuns(plane, 'cols', 0, plane.height), plane.width),
    };
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
 * The sheet's cells. Read off the divider lines the model drew whenever they
 * form a plausible grid, even when that grid differs from the cols x rows
 * that were asked for — the model keeps row-major order, so the drawn cells
 * still map to the characters in sequence. Row lines are found over the
 * full width; column lines are found PER ROW BAND, because the model has
 * drawn rows with different column layouts (and a column line that stops
 * short of the last row). A band without lines of its own borrows the
 * layout of the band above it. The equal split of the requested grid is the
 * last resort when no lines are found at all (the caller logs it; the kept
 * sheet lets the owner reframe by hand either way).
 */
export function detectSheetGrid(plane: GreyPlane, cols: number, rows: number): SheetGrid {
    const {width, height} = plane;
    const rowLines = dropSliverMakers(lineRuns(plane, 'rows', 0, width), height);
    const bands = spans(rowLines, height);
    const cells: ImageRect[] = [];
    let previous: Run[] | null = null;
    let colCount = 0;
    for (const band of bands) {
        let colLines = dropSliverMakers(lineRuns(plane, 'cols', band.start, band.end), width);
        if (colLines.length === 0 && previous) colLines = previous;
        previous = colLines;
        const xs = spans(colLines, width);
        colCount = Math.max(colCount, xs.length);
        for (const x of xs) {
            cells.push(inset({left: x.start, top: band.start, width: x.end - x.start, height: band.end - band.start}, DIVIDER_INSET));
        }
    }
    if (colCount < 2) return equalSplitGrid(width, height, cols, rows);
    return {cells, cols: colCount, rows: bands.length, detected: true};
}

/** What findDividers saw, for the mismatch log line. */
export function describeDividers(plane: GreyPlane): string {
    const d = findDividers(plane);
    const fmt = (r: Run[]) => r.map(x => `${x.start}-${x.end}`).join(',') || 'none';
    return `rows@${fmt(d.rows)} cols@${fmt(d.cols)}`;
}
