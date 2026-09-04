import assert from "node:assert/strict";

import { findCurrentHeading } from "../../src/currentHeading";

interface TestHeading {
  readonly label: string;
  readonly level: number;
  readonly line: number;
}

function heading(label: string, level: number, line: number): TestHeading {
  return { label, level, line };
}

describe("findCurrentHeading", (): void => {
  it("returns undefined for empty input and lines before the first heading", (): void => {
    assert.equal(findCurrentHeading([], 0), undefined);
    assert.equal(findCurrentHeading([heading("first", 1, 3)], 2), undefined);
  });

  it("handles exact, body, nested, source-transition, and EOF lines", (): void => {
    const heading_headingId = [
      heading("root", 1, 2),
      heading("child", 2, 5),
      heading("nested", 3, 8),
      heading("sibling", 2, 12),
      heading("next root", 1, 17),
    ];

    assert.equal(findCurrentHeading(heading_headingId, 2)?.label, "root");
    assert.equal(findCurrentHeading(heading_headingId, 4)?.label, "root");
    assert.equal(findCurrentHeading(heading_headingId, 5)?.label, "child");
    assert.equal(findCurrentHeading(heading_headingId, 11)?.label, "nested");
    assert.equal(findCurrentHeading(heading_headingId, 12)?.label, "sibling");
    assert.equal(findCurrentHeading(heading_headingId, 16)?.label, "sibling");
    assert.equal(findCurrentHeading(heading_headingId, 17)?.label, "next root");
    assert.equal(findCurrentHeading(heading_headingId, 100)?.label, "next root");
  });

  it("returns the rightmost item when source lines are equal", (): void => {
    const first = heading("first", 1, 4);
    const rightmost = heading("rightmost", 2, 4);

    assert.equal(findCurrentHeading([first, rightmost], 4), rightmost);
  });

  it("does not mutate its input or item objects", (): void => {
    const first = Object.freeze(heading("first", 1, 1));
    const second = Object.freeze(heading("second", 2, 4));
    const heading_headingId = Object.freeze([first, second]);
    const before = JSON.stringify(heading_headingId);

    const result = findCurrentHeading(heading_headingId, 6);

    assert.equal(result, second);
    assert.equal(JSON.stringify(heading_headingId), before);
    assert.equal(heading_headingId[0], first);
    assert.equal(heading_headingId[1], second);
  });
});
