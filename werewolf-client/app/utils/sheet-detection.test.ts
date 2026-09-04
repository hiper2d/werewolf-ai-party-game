/**
 * Portrait-sheet cell detection: the model draws the divider lines where it
 * likes, so the cells are read off the pixels rather than assumed equal.
 */

import { describeDividers, detectSheetGrid, equalSplitGrid, findDividers, GreyPlane } from './sheet-detection';

/** A synthetic sheet: light cells, near-black divider lines at the given
 * positions (each `thickness` px), plus a 3px border frame. */
function sheet(width: number, height: number, rowLines: number[], colLines: number[], thickness = 6, border = 3): GreyPlane {
    const data = new Uint8Array(width * height).fill(150);
    const paintRow = (y: number) => { for (let x = 0; x < width; x++) data[y * width + x] = 20; };
    const paintCol = (x: number) => { for (let y = 0; y < height; y++) data[y * width + x] = 20; };
    for (let b = 0; b < border; b++) { paintRow(b); paintRow(height - 1 - b); paintCol(b); paintCol(width - 1 - b); }
    for (const y of rowLines) for (let t = 0; t < thickness; t++) paintRow(y + t);
    for (const x of colLines) for (let t = 0; t < thickness; t++) paintCol(x + t);
    return { width, height, data };
}

describe('findDividers', () => {
    it('reports internal lines and ignores the border frame', () => {
        const plane = sheet(400, 300, [140], [100, 200, 300]);
        const d = findDividers(plane);
        expect(d.rows).toEqual([{ start: 140, end: 145 }]);
        expect(d.cols.map(c => c.start)).toEqual([100, 200, 300]);
    });

    it('ignores a dark band far thicker than a line (a dark art style, not a boundary)', () => {
        const plane = sheet(400, 300, [140], [100, 200, 300]);
        for (let y = 200; y < 260; y++) for (let x = 0; x < 400; x++) plane.data[y * 400 + x] = 15;
        expect(findDividers(plane).rows).toEqual([{ start: 140, end: 145 }]);
    });

    it('treats a dark name plate hugging a line as part of the boundary', () => {
        const plane = sheet(400, 400, [200], [100, 200, 300]);
        for (let y = 180; y < 200; y++) for (let x = 0; x < 400; x++) plane.data[y * 400 + x] = 15; // plate above the line
        const grid = detectSheetGrid(plane, 4, 2);
        expect(findDividers(plane).rows).toEqual([{ start: 180, end: 205 }]);
        expect(grid.cells[0].top + grid.cells[0].height).toBeLessThanOrEqual(180);
    });

    it('does not take a dark portrait for a line', () => {
        const plane = sheet(400, 300, [], []);
        // A dark 60%-wide band: clothing across most of a row, never a divider.
        for (let x = 0; x < 240; x++) plane.data[150 * 400 + x] = 10;
        expect(findDividers(plane).rows).toEqual([]);
    });
});

describe('detectSheetGrid', () => {
    it('uses the drawn lines when they match the request — drifting rows included', () => {
        // Rows 0-140, 146-270, 276-400: unequal, as the model really draws them.
        const plane = sheet(400, 400, [140, 270], [100, 200, 300]);
        const grid = detectSheetGrid(plane, 4, 3);
        expect(grid.detected).toBe(true);
        expect(grid.cells).toHaveLength(12);
        // Second row, first column: between the first line's end and the
        // second line's start, inset by the anti-alias margin.
        expect(grid.cells[4]).toEqual({ left: 4, top: 150, width: 92, height: 116 });
        // Last row runs to the bottom edge.
        expect(grid.cells[8].top + grid.cells[8].height).toBe(396);
    });

    it('uses the drawn grid even when it is not the one requested', () => {
        const plane = sheet(600, 400, [200], [100, 200, 300, 400, 500]); // 6x2 drawn, 4x4 asked
        const grid = detectSheetGrid(plane, 4, 4);
        expect(grid.detected).toBe(true);
        expect(grid.cols).toBe(6);
        expect(grid.rows).toBe(2);
        expect(grid.cells).toHaveLength(12);
        expect(describeDividers(plane)).toContain('rows@200-205');
    });

    it('falls back to the equal split when no column lines are found', () => {
        const plane = sheet(400, 400, [200], []);
        const grid = detectSheetGrid(plane, 4, 4);
        expect(grid.detected).toBe(false);
        expect(grid.cells).toEqual(equalSplitGrid(400, 400, 4, 4).cells);
    });

    it('ignores lines that would leave a sliver instead of a cell', () => {
        const plane = sheet(400, 300, [10, 30], [100, 200, 300]);
        const grid = detectSheetGrid(plane, 4, 3);
        expect(grid.detected).toBe(true);
        expect(grid.rows).toBe(1);
        expect(grid.cells).toHaveLength(4);
    });

    it('ignores hairline specks thinner than a drawn line', () => {
        const plane = sheet(400, 400, [200], [100, 200, 300], 6);
        for (let x = 0; x < 400; x++) plane.data[300 * 400 + x] = 10; // one dark pixel row
        expect(findDividers(plane).rows).toEqual([{ start: 200, end: 205 }]);
    });

    it('reads column lines per row band, so rows may differ', () => {
        // Top band: 2 columns (line at 200). Bottom band: 4 columns.
        const plane = sheet(400, 400, [200], []);
        for (let y = 0; y < 200; y++) for (let t = 0; t < 6; t++) plane.data[y * 400 + 200 + t] = 20;
        for (let y = 206; y < 400; y++) for (const x of [100, 200, 300]) for (let t = 0; t < 6; t++) plane.data[y * 400 + x + t] = 20;
        const grid = detectSheetGrid(plane, 4, 2);
        expect(grid.detected).toBe(true);
        expect(grid.cells).toHaveLength(6);
        expect(grid.cells[0].width).toBeGreaterThan(150);
        expect(grid.cells[2].width).toBeLessThan(100);
    });

    it('lets a band without lines borrow the layout above it', () => {
        const plane = sheet(400, 400, [200], []);
        for (let y = 0; y < 200; y++) for (let t = 0; t < 6; t++) plane.data[y * 400 + 200 + t] = 20;
        const grid = detectSheetGrid(plane, 2, 2);
        expect(grid.cells).toHaveLength(4);
    });
});

describe('equalSplitGrid', () => {
    it('insets each cell from the assumed divider by 8px', () => {
        const grid = equalSplitGrid(800, 600, 4, 3);
        expect(grid.cells[0]).toEqual({ left: 8, top: 8, width: 184, height: 184 });
        expect(grid.cells[11]).toEqual({ left: 608, top: 408, width: 184, height: 184 });
    });
});
