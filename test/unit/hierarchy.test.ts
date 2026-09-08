import assert from "node:assert/strict";

import { buildHeadingHierarchy } from "../../src/hierarchy";
import type { Heading } from "../../src/model";

function makeHeading(label: string, level: number, line: number): Heading {
  return {
    id: label,
    documentIdentity: "hierarchy-test",
    level,
    snippet: `@h${level}`,
    matchedSnippet: `@h${level}`,
    label,
    line,
    startCharacter: 0,
    endCharacter: 3,
    sourceLine: label,
    titleRanges: [{ startCharacter: 0, endCharacter: label.length }],
  };
}

describe("buildHeadingHierarchy", (): void => {
  it("implements the A-H example", (): void => {
    const heading_headingId = [
      makeHeading("A", 1, 0),
      makeHeading("B", 2, 1),
      makeHeading("C", 2, 2),
      makeHeading("D", 1, 3),
      makeHeading("E", 3, 4),
      makeHeading("F", 2, 5),
      makeHeading("G", 3, 6),
      makeHeading("H", 4, 7),
    ];

    const heading_rootId = buildHeadingHierarchy(heading_headingId);

    assert.deepEqual(heading_rootId.map((heading) => heading.label), ["A", "D"]);
    assert.deepEqual(
      heading_rootId[0]?.heading_childId.map((heading) => heading.label),
      ["B", "C"],
    );
    assert.deepEqual(
      heading_rootId[1]?.heading_childId.map((heading) => heading.label),
      ["E", "F"],
    );
    const f = heading_rootId[1]?.heading_childId[1];
    const g = f?.heading_childId[0];
    assert.equal(g?.label, "G");
    assert.equal(g?.heading_childId[0]?.label, "H");
  });

  it("makes skipped levels direct children without placeholders", (): void => {
    const heading_rootId = buildHeadingHierarchy([
      makeHeading("level one", 1, 0),
      makeHeading("level four", 4, 1),
    ]);

    assert.equal(heading_rootId.length, 1);
    assert.equal(heading_rootId[0]?.heading_childId.length, 1);
    assert.equal(heading_rootId[0]?.heading_childId[0]?.label, "level four");
  });

  it("closes same-level and deeper headings", (): void => {
    const heading_rootId = buildHeadingHierarchy([
      makeHeading("one", 1, 0),
      makeHeading("two-a", 2, 1),
      makeHeading("three", 3, 2),
      makeHeading("two-b", 2, 3),
      makeHeading("root", 1, 4),
    ]);

    assert.deepEqual(heading_rootId.map((heading) => heading.label), ["one", "root"]);
    assert.deepEqual(
      heading_rootId[0]?.heading_childId.map((heading) => heading.label),
      ["two-a", "two-b"],
    );
    assert.equal(
      heading_rootId[0]?.heading_childId[0]?.heading_childId[0]?.label,
      "three",
    );
    assert.equal(heading_rootId[0]?.heading_childId[1]?.heading_childId.length, 0);
  });

  it("keeps an initial deep heading at the root", (): void => {
    const heading_rootId = buildHeadingHierarchy([
      makeHeading("deep", 4, 0),
      makeHeading("deeper", 5, 1),
    ]);

    assert.equal(heading_rootId[0]?.label, "deep");
    assert.equal(heading_rootId[0]?.heading_childId[0]?.label, "deeper");
  });

  it("does not mutate flat heading objects", (): void => {
    const heading = makeHeading("one", 1, 0);
    buildHeadingHierarchy([heading, makeHeading("two", 2, 1)]);

    assert.equal("heading_childId" in heading, false);
  });
});
