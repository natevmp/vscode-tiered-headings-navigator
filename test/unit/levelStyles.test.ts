import assert from "node:assert/strict";

import {
  buildHeadingStyleMap,
  defaultLevelStyle_level,
  parseLevelStyleDefinitions,
  resolveHeadingTextStyle,
} from "../../src/configuration";
import { groupHeadingsByTextStyle } from "../../src/headingStyles";
import type { Heading } from "../../src/model";

function createHeading(id: string, level: number): Heading {
  return {
    id,
    documentIdentity: "document",
    level,
    snippet: "@h",
    matchedSnippet: "@h",
    label: id,
    line: level,
    startCharacter: 0,
    endCharacter: 2,
    sourceLine: `@h ${id}`,
    titleRanges: [{ startCharacter: 3, endCharacter: 3 + id.length }],
  };
}

describe("parseLevelStyleDefinitions", (): void => {
  it("exports the expected defaults", (): void => {
    assert.deepEqual(defaultLevelStyle_level, [
      { level: 1, style: "bold" },
      { level: 2, style: "boldItalic" },
      { level: 3, style: "italic" },
    ]);
  });

  it("falls back to defaults and reports non-array input", (): void => {
    const result = parseLevelStyleDefinitions({ level: 1, style: "bold" });

    assert.deepEqual(result.levelStyle_level, defaultLevelStyle_level);
    assert.equal(result.issue_issueId.length, 1);
    assert.equal(result.issue_issueId[0]?.levelStyleIndex, null);
    assert.equal(
      result.issue_issueId[0]?.settingKey,
      "tieredHeadings.editor.levelStyles",
    );
    assert.match(result.issue_issueId[0]?.message ?? "", /must be an array.*defaults/i);
  });

  it("accepts an empty array to disable text styling", (): void => {
    const result = parseLevelStyleDefinitions([]);

    assert.deepEqual(result.levelStyle_level, []);
    assert.deepEqual(result.issue_issueId, []);
  });

  it("accepts every supported style and arbitrary positive levels", (): void => {
    const levelStyle_rawId = [
      { level: 1, style: "normal" },
      { level: 27, style: "bold" },
      { level: 1_000_000, style: "italic" },
      { level: Number.MAX_SAFE_INTEGER, style: "boldItalic" },
    ];

    const result = parseLevelStyleDefinitions(levelStyle_rawId);

    assert.deepEqual(result.levelStyle_level, levelStyle_rawId);
    assert.deepEqual(result.issue_issueId, []);
  });

  it("rejects non-object entries while preserving surrounding valid entries", (): void => {
    const result = parseLevelStyleDefinitions([
      { level: 4, style: "bold" },
      null,
      "italic",
      [5, "italic"],
      { level: 6, style: "italic" },
    ]);

    assert.deepEqual(result.levelStyle_level, [
      { level: 4, style: "bold" },
      { level: 6, style: "italic" },
    ]);
    assert.equal(result.issue_issueId.length, 3);
    result.issue_issueId.forEach((issue): void => {
      assert.match(issue.message, /must be an object/i);
    });
  });

  it("rejects invalid levels and styles", (): void => {
    const result = parseLevelStyleDefinitions([
      { level: 0, style: "bold" },
      { level: -1, style: "bold" },
      { level: 1.5, style: "bold" },
      { level: Number.NaN, style: "bold" },
      { level: "2", style: "bold" },
      { level: 3, style: "Bold" },
      { level: 4, style: "underline" },
      { level: 5, style: null },
      { level: 6 },
    ]);

    assert.deepEqual(result.levelStyle_level, []);
    assert.equal(result.issue_issueId.length, 9);
    result.issue_issueId.slice(0, 5).forEach((issue): void => {
      assert.match(issue.message, /integer level/i);
    });
    result.issue_issueId.slice(5).forEach((issue): void => {
      assert.match(issue.message, /normal, bold, italic, or boldItalic/i);
    });
  });

  it("reports and ignores unsupported properties without losing safe fields", (): void => {
    const result = parseLevelStyleDefinitions([
      { level: 1, style: "bold", color: "red" },
      { level: 2, style: "italic" },
    ]);

    assert.deepEqual(result.levelStyle_level, [
      { level: 1, style: "bold" },
      { level: 2, style: "italic" },
    ]);
    assert.equal(result.issue_issueId.length, 1);
    assert.equal(result.issue_issueId[0]?.levelStyleIndex, 0);
    assert.match(result.issue_issueId[0]?.message ?? "", /unsupported property.*color/i);
  });

  it("reports and rejects later duplicate levels", (): void => {
    const result = parseLevelStyleDefinitions([
      { level: 8, style: "normal" },
      { level: 8, style: "boldItalic" },
      { level: 9, style: "italic" },
    ]);

    assert.deepEqual(result.levelStyle_level, [
      { level: 8, style: "normal" },
      { level: 9, style: "italic" },
    ]);
    assert.equal(result.issue_issueId.length, 1);
    assert.equal(result.issue_issueId[0]?.levelStyleIndex, 1);
    assert.match(result.issue_issueId[0]?.message ?? "", /duplicates heading level 8/i);
  });

  it("does not let an invalid entry reserve its level", (): void => {
    const result = parseLevelStyleDefinitions([
      { level: 12, style: "underline" },
      { level: 12, style: "bold" },
    ]);

    assert.deepEqual(result.levelStyle_level, [{ level: 12, style: "bold" }]);
    assert.equal(result.issue_issueId.length, 1);
  });

  it("validates large style collections without pairwise duplicate scans", (): void => {
    const levelStyle_level = Array.from(
      { length: 5_000 },
      (_, levelIndex: number) => ({ level: levelIndex + 1, style: "bold" }),
    );

    const result = parseLevelStyleDefinitions(levelStyle_level);

    assert.equal(result.levelStyle_level.length, levelStyle_level.length);
    assert.deepEqual(result.issue_issueId, []);
  });
});

describe("heading style resolution", (): void => {
  it("maps configured arbitrary levels and resolves unlisted levels to normal", (): void => {
    const styleByLevel = buildHeadingStyleMap([
      { level: 2, style: "normal" },
      { level: 47, style: "boldItalic" },
    ]);

    assert.equal(resolveHeadingTextStyle(2, styleByLevel), "normal");
    assert.equal(resolveHeadingTextStyle(47, styleByLevel), "boldItalic");
    assert.equal(resolveHeadingTextStyle(1, styleByLevel), "normal");
    assert.equal(resolveHeadingTextStyle(48, styleByLevel), "normal");
  });

  it("resolves every level to normal for an empty configuration", (): void => {
    const styleByLevel = buildHeadingStyleMap([]);

    assert.equal(styleByLevel.size, 0);
    assert.equal(resolveHeadingTextStyle(Number.MAX_SAFE_INTEGER, styleByLevel), "normal");
  });

  it("groups only headings that need an editor decoration", (): void => {
    const heading_headingId = [
      createHeading("one", 1),
      createHeading("two", 2),
      createHeading("three", 3),
      createHeading("four", 4),
      createHeading("five", 5),
    ];
    const styleByLevel = buildHeadingStyleMap([
      { level: 1, style: "bold" },
      { level: 2, style: "boldItalic" },
      { level: 3, style: "italic" },
      { level: 4, style: "normal" },
    ]);

    const groups = groupHeadingsByTextStyle(heading_headingId, styleByLevel);

    assert.deepEqual(groups.heading_boldId.map((heading: Heading): string => heading.id), ["one"]);
    assert.deepEqual(
      groups.heading_boldItalicId.map((heading: Heading): string => heading.id),
      ["two"],
    );
    assert.deepEqual(
      groups.heading_italicId.map((heading: Heading): string => heading.id),
      ["three"],
    );
  });
});
