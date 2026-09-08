import assert from "node:assert/strict";

import {
  getHeadingMarkerPresentation,
  groupHeadingMarkerRanges,
} from "../../src/headingPresentation";
import type { Heading } from "../../src/model";

function createHeading(
  id: string,
  level: number,
  line: number,
  startCharacter: number,
  endCharacter: number,
): Heading {
  return {
    id,
    documentIdentity: "document",
    level,
    snippet: "@h",
    matchedSnippet: "@h",
    label: id,
    line,
    startCharacter,
    endCharacter,
    sourceLine: `@h ${id}`,
    titleRanges: [{ startCharacter: 3, endCharacter: 3 + id.length }],
  };
}

describe("heading marker presentation", (): void => {
  it("maps levels to shared ThemeIcon and asset presentations", (): void => {
    assert.deepEqual(getHeadingMarkerPresentation(1), {
      category: "filledCircle",
      paneIcon: { kind: "theme", themeIconId: "circle-filled" },
      assetName: "marker-filled-circle.svg",
    });
    assert.deepEqual(getHeadingMarkerPresentation(2), {
      category: "openCircle",
      paneIcon: { kind: "theme", themeIconId: "circle-outline" },
      assetName: "marker-open-circle.svg",
    });
    assert.deepEqual(getHeadingMarkerPresentation(3), {
      category: "plus",
      paneIcon: { kind: "asset" },
      assetName: "marker-plus.svg",
    });
    assert.deepEqual(getHeadingMarkerPresentation(4), {
      category: "dash",
      paneIcon: { kind: "theme", themeIconId: "dash" },
      assetName: "marker-dash.svg",
    });
    assert.equal(getHeadingMarkerPresentation(99), getHeadingMarkerPresentation(4));
  });

  it("groups exact trigger ranges for all four marker categories in one pass", (): void => {
    const heading_headingId = [
      createHeading("one", 1, 2, 3, 6),
      createHeading("two", 2, 4, 5, 9),
      createHeading("three", 3, 6, 7, 12),
      createHeading("four", 4, 8, 9, 15),
      createHeading("higher", 12, 10, 11, 18),
    ];

    const groups = groupHeadingMarkerRanges(heading_headingId);

    assert.deepEqual(groups.range_filledCircleId, [{
      line: 2,
      startCharacter: 3,
      endCharacter: 6,
    }]);
    assert.deepEqual(groups.range_openCircleId, [{
      line: 4,
      startCharacter: 5,
      endCharacter: 9,
    }]);
    assert.deepEqual(groups.range_plusId, [{
      line: 6,
      startCharacter: 7,
      endCharacter: 12,
    }]);
    assert.deepEqual(groups.range_dashId, [
      { line: 8, startCharacter: 9, endCharacter: 15 },
      { line: 10, startCharacter: 11, endCharacter: 18 },
    ]);
  });

  it("returns empty gutter groups when gutter markers are disabled", (): void => {
    const groups = groupHeadingMarkerRanges([
      createHeading("one", 1, 0, 0, 3),
      createHeading("two", 2, 1, 0, 3),
      createHeading("three", 3, 2, 0, 3),
      createHeading("four", 4, 3, 0, 3),
    ], false);

    assert.deepEqual(groups, {
      range_filledCircleId: [],
      range_openCircleId: [],
      range_plusId: [],
      range_dashId: [],
    });
  });
});
