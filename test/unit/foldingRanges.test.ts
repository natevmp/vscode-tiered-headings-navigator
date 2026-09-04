import assert from "node:assert/strict";

import {
  calculateHeadingFoldingRanges,
  type FoldingHeading,
  type HeadingFoldingRange,
} from "../../src/foldingRanges";

function heading(line: number, level: number): FoldingHeading {
  return { line, level };
}

describe("calculateHeadingFoldingRanges", (): void => {
  it("closes ranges at same-level and ancestor boundaries", (): void => {
    const result = calculateHeadingFoldingRanges([
      heading(0, 1),
      heading(2, 2),
      heading(5, 2),
      heading(8, 1),
    ], 11);

    assert.deepEqual(result, [
      { startLine: 0, endLine: 7 },
      { startLine: 2, endLine: 4 },
      { startLine: 5, endLine: 7 },
      { startLine: 8, endLine: 10 },
    ]);
  });

  it("keeps nested and skipped levels open until a shallower boundary", (): void => {
    const result = calculateHeadingFoldingRanges([
      heading(0, 1),
      heading(2, 4),
      heading(4, 5),
      heading(7, 2),
    ], 10);

    assert.deepEqual(result, [
      { startLine: 0, endLine: 9 },
      { startLine: 2, endLine: 6 },
      { startLine: 4, endLine: 6 },
      { startLine: 7, endLine: 9 },
    ]);
  });

  it("omits consecutive headings whose sections have no following line", (): void => {
    const result = calculateHeadingFoldingRanges([
      heading(0, 1),
      heading(1, 2),
      heading(2, 2),
      heading(3, 1),
      heading(5, 1),
    ], 6);

    assert.deepEqual(result, [
      { startLine: 0, endLine: 2 },
      { startLine: 3, endLine: 4 },
    ]);
  });

  it("handles EOF, no headings, and a single-line un-foldable section", (): void => {
    assert.deepEqual(calculateHeadingFoldingRanges([], 4), []);
    assert.deepEqual(calculateHeadingFoldingRanges([heading(3, 1)], 4), []);
    assert.deepEqual(calculateHeadingFoldingRanges([heading(2, 1)], 4), [
      { startLine: 2, endLine: 3 },
    ]);
  });

  it("includes blank lines immediately before a boundary", (): void => {
    assert.deepEqual(calculateHeadingFoldingRanges([
      heading(0, 1),
      heading(4, 1),
    ], 6), [
      { startLine: 0, endLine: 3 },
      { startLine: 4, endLine: 5 },
    ]);
  });

  it("returns source-ordered ranges that are nested or disjoint", (): void => {
    const result = calculateHeadingFoldingRanges([
      heading(0, 1),
      heading(1, 3),
      heading(3, 5),
      heading(6, 3),
      heading(9, 1),
    ], 12);

    assert.deepEqual(result.map((range: HeadingFoldingRange): number => range.startLine), [
      0,
      1,
      3,
      6,
      9,
    ]);
    result.forEach((range: HeadingFoldingRange, rangeIndex: number): void => {
      result.slice(rangeIndex + 1).forEach((laterRange: HeadingFoldingRange): void => {
        const nested = laterRange.endLine <= range.endLine;
        const disjoint = laterRange.startLine > range.endLine;
        assert.equal(nested || disjoint, true);
      });
    });
  });

  it("does not mutate its input array or heading objects", (): void => {
    const first = Object.freeze(heading(0, 1));
    const second = Object.freeze(heading(2, 2));
    const heading_headingId = Object.freeze([first, second]);
    const before = JSON.stringify(heading_headingId);

    calculateHeadingFoldingRanges(heading_headingId, 4);

    assert.equal(JSON.stringify(heading_headingId), before);
    assert.equal(heading_headingId[0], first);
    assert.equal(heading_headingId[1], second);
  });
});
