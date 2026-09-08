import assert from "node:assert/strict";

import { parseTriggerDefinitions } from "../../src/configuration";
import type { TriggerDefinition } from "../../src/model";
import { scanDocument } from "../../src/scanner";

describe("scanDocument", (): void => {
  it("matches regular-expression metacharacters literally", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      { snippet: ".*+?^${}()|[]\\", level: 1, labelTemplate: "${after}" },
    ];
    const heading_headingId = scanDocument(
      "not a trigger .*\nxx .*+?^${}()|[]\\ Literal title",
      "file:///literal.txt",
      trigger_triggerId,
      true,
    );

    assert.equal(heading_headingId.length, 1);
    assert.equal(heading_headingId[0]?.line, 1);
    assert.equal(heading_headingId[0]?.startCharacter, 3);
    assert.equal(heading_headingId[0]?.endCharacter, 17);
    assert.equal(heading_headingId[0]?.label, "Literal title");
    assert.deepEqual(heading_headingId[0]?.titleRanges, [{
      startCharacter: 18,
      endCharacter: 31,
    }]);
  });

  it("chooses earliest, then longest, then configuration order", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      { snippet: "@h1", level: 1, labelTemplate: "short ${after}" },
      { snippet: "@h10", level: 10, labelTemplate: "long ${after}" },
      { snippet: "TITLE", level: 3, labelTemplate: "upper" },
      { snippet: "title", level: 4, labelTemplate: "lower" },
    ];
    const heading_headingId = scanDocument(
      "@h10 overlap @h1\ntitle first @h10 later",
      "precedence",
      trigger_triggerId,
      false,
    );

    assert.equal(heading_headingId.length, 2);
    assert.equal(heading_headingId[0]?.level, 10, "longest snippet wins at one position");
    assert.equal(heading_headingId[0]?.label, "long  overlap @h1");
    assert.equal(heading_headingId[1]?.level, 3, "configuration order resolves exact ties");
    assert.equal(heading_headingId[1]?.matchedSnippet, "title");
  });

  it("honors case sensitivity and preserves source casing and positions", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      { snippet: "@Head", level: 1, labelTemplate: "${trigger}: ${after}" },
    ];
    const text = "xx @head Mixed Case";

    assert.equal(scanDocument(text, "case", trigger_triggerId, true).length, 0);

    const heading_headingId = scanDocument(text, "case", trigger_triggerId, false);
    assert.equal(heading_headingId.length, 1);
    assert.equal(heading_headingId[0]?.startCharacter, 3);
    assert.equal(heading_headingId[0]?.endCharacter, 8);
    assert.equal(heading_headingId[0]?.matchedSnippet, "@head");
    assert.equal(heading_headingId[0]?.label, "@head:  Mixed Case");
    assert.equal(heading_headingId[0]?.sourceLine, text);
  });

  it("supports Unicode case folding outside legacy regular-expression mode", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      { snippet: "𐐀", level: 1, labelTemplate: "${after}" },
      { snippet: "K", level: 2, labelTemplate: "${after}" },
    ];
    const heading_headingId = scanDocument(
      "𐐨 Supplementary\nK Kelvin",
      "unicode-case",
      trigger_triggerId,
      false,
    );

    assert.equal(heading_headingId.length, 2);
    assert.equal(heading_headingId[0]?.matchedSnippet, "𐐨");
    assert.equal(heading_headingId[0]?.endCharacter, 2);
    assert.equal(heading_headingId[1]?.matchedSnippet, "K");
  });

  it("handles CRLF, LF, and CR as physical line endings", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      { snippet: "#", level: 1, labelTemplate: "${lineNumber}:${after}" },
    ];
    const heading_headingId = scanDocument(
      "# one\r\nxx # two\n# three\rprefix # four",
      "endings",
      trigger_triggerId,
      true,
    );

    assert.deepEqual(
      heading_headingId.map((heading) => ({
        line: heading.line,
        start: heading.startCharacter,
        end: heading.endCharacter,
        source: heading.sourceLine,
        label: heading.label,
        titleRanges: heading.titleRanges,
      })),
      [
        {
          line: 0,
          start: 0,
          end: 1,
          source: "# one",
          label: "1: one",
          titleRanges: [{ startCharacter: 1, endCharacter: 5 }],
        },
        {
          line: 1,
          start: 3,
          end: 4,
          source: "xx # two",
          label: "2: two",
          titleRanges: [{ startCharacter: 4, endCharacter: 8 }],
        },
        {
          line: 2,
          start: 0,
          end: 1,
          source: "# three",
          label: "3: three",
          titleRanges: [{ startCharacter: 1, endCharacter: 7 }],
        },
        {
          line: 3,
          start: 7,
          end: 8,
          source: "prefix # four",
          label: "4: four",
          titleRanges: [{ startCharacter: 8, endCharacter: 13 }],
        },
      ],
    );
  });

  it("uses UTF-16 line offsets for source-backed plain labels", (): void => {
    const heading = scanDocument(
      "😀 @h1  Café 😀  ",
      "utf16",
      [{ snippet: "@h1", level: 1, labelTemplate: "${after}" }],
      true,
    )[0];

    assert.equal(heading?.label, "Café 😀");
    assert.deepEqual(heading?.titleRanges, [{ startCharacter: 8, endCharacter: 15 }]);
  });

  it("creates stable IDs with ordinals only among otherwise-identical headings", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      { snippet: "@h1", level: 1, labelTemplate: "Same" },
    ];
    const original_headingId = scanDocument(
      "@h1 first\n@h1 second",
      "document-id",
      trigger_triggerId,
      true,
    );
    const inserted_headingId = scanDocument(
      "unrelated line\n@h1 first\nnot a heading\n@h1 second",
      "document-id",
      trigger_triggerId,
      true,
    );

    assert.equal(original_headingId[0]?.id, inserted_headingId[0]?.id);
    assert.equal(original_headingId[1]?.id, inserted_headingId[1]?.id);
    assert.notEqual(original_headingId[0]?.id, original_headingId[1]?.id);
    assert.match(original_headingId[0]?.id ?? "", /document-id/);
  });

  it("keeps IDs stable when labels or configured levels change", (): void => {
    const original_headingId = scanDocument(
      "@h1 Original title",
      "document-id",
      [{ snippet: "@h1", level: 1, labelTemplate: "${after}" }],
      true,
    );
    const changed_headingId = scanDocument(
      "@h1 Renamed title",
      "document-id",
      [{ snippet: "@h1", level: 4, labelTemplate: "Prefix ${after}" }],
      true,
    );

    assert.equal(original_headingId[0]?.id, changed_headingId[0]?.id);
  });

  it("creates no more than one heading for a line", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      { snippet: "@h1", level: 1, labelTemplate: "${after}" },
      { snippet: "@h2", level: 2, labelTemplate: "${after}" },
    ];
    const heading_headingId = scanDocument(
      "prefix @h2 selected @h1 ignored",
      "single",
      trigger_triggerId,
      true,
    );

    assert.equal(heading_headingId.length, 1);
    assert.equal(heading_headingId[0]?.snippet, "@h2");
  });

  it("extracts exact symmetric delimiters into the after context", (): void => {
    const heading_headingId = scanDocument(
      "# @h1   ----   A title   ----  ",
      "delimited",
      [{
        snippet: "@h1",
        level: 1,
        labelTemplate: "${after}",
        labelDelimiters: { start: "----", end: "----" },
      }],
      true,
    );

    assert.equal(heading_headingId[0]?.label, "A title");
    assert.deepEqual(heading_headingId[0]?.titleRanges, [{
      startCharacter: 15,
      endCharacter: 22,
    }]);
    assert.equal(heading_headingId[0]?.sourceLine, "# @h1   ----   A title   ----  ");
  });

  it("uses mixed per-trigger symmetric and asymmetric delimiters", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      {
        snippet: "@h1",
        level: 1,
        labelTemplate: "${after}",
        labelDelimiters: { start: "----", end: "----" },
      },
      {
        snippet: "@h2",
        level: 2,
        labelTemplate: "Part: ${after}",
        labelDelimiters: { start: "[[", end: ">>" },
      },
      { snippet: "@h3", level: 3, labelTemplate: "${after}" },
    ];
    const heading_headingId = scanDocument(
      "@h1 ---- One ----\n@h2 [[ Two >>\n@h3 Plain three",
      "mixed-delimiters",
      trigger_triggerId,
      true,
    );

    assert.deepEqual(
      heading_headingId.map((heading) => heading.label),
      ["One", "Part: Two", "Plain three"],
    );
  });

  it("falls back without partial stripping for mismatches or overlap", (): void => {
    const trigger: TriggerDefinition = {
      snippet: "@h1",
      level: 1,
      labelTemplate: "${after}",
      labelDelimiters: { start: "----", end: "----" },
    };
    const heading_headingId = scanDocument(
      "@h1 --- Start mismatch ----\n@h1 ---- End mismatch ---\n@h1 -----",
      "delimiter-fallback",
      [trigger],
      true,
    );

    assert.deepEqual(
      heading_headingId.map((heading) => heading.label),
      ["--- Start mismatch ----", "---- End mismatch ---", "-----"],
    );
    assert.deepEqual(
      heading_headingId.map((heading) => heading.titleRanges),
      [
        [{ startCharacter: 4, endCharacter: 27 }],
        [{ startCharacter: 4, endCharacter: 25 }],
        [{ startCharacter: 4, endCharacter: 9 }],
      ],
    );
  });

  it("keeps delimiter matching case-sensitive for case-insensitive triggers", (): void => {
    const heading_headingId = scanDocument(
      "@heading BEGIN Title end",
      "delimiter-case",
      [{
        snippet: "@Heading",
        level: 1,
        labelTemplate: "${after}",
        labelDelimiters: { start: "BEGIN", end: "END" },
      }],
      false,
    );

    assert.equal(heading_headingId[0]?.matchedSnippet, "@heading");
    assert.equal(heading_headingId[0]?.label, "BEGIN Title end");
  });

  it("uses the existing blank-label fallback for empty extraction", (): void => {
    const heading_headingId = scanDocument(
      "@h1   --------  ",
      "empty-delimited",
      [{
        snippet: "@h1",
        level: 1,
        labelTemplate: "${after}",
        labelDelimiters: { start: "----", end: "----" },
      }],
      true,
    );

    assert.equal(heading_headingId[0]?.label, "Untitled heading (line 1)");
    assert.deepEqual(heading_headingId[0]?.titleRanges, []);
  });

  it("preserves before and line contexts during delimiter extraction", (): void => {
    const heading_headingId = scanDocument(
      "prefix @h1 ---- Title ----",
      "raw-context",
      [{
        snippet: "@h1",
        level: 1,
        labelTemplate: "${before}|${after}|${line}",
        labelDelimiters: { start: "----", end: "----" },
      }],
      true,
    );

    assert.equal(
      heading_headingId[0]?.label,
      "prefix |Title|prefix @h1 ---- Title ----",
    );
  });

  it("replaces only raw after-text without changing trigger or line data", (): void => {
    const sourceLine = "## @h1 This is the title -----------------";
    const heading_headingId = scanDocument(
      sourceLine,
      "regex-exact",
      [{
        snippet: "@h1",
        level: 1,
        labelTemplate: "${after}",
        labelRegex: { pattern: "\\s*-+\\s*$", replacement: "" },
      }],
      true,
    );

    assert.equal(heading_headingId.length, 1);
    assert.equal(heading_headingId[0]?.label, "This is the title");
    assert.equal(heading_headingId[0]?.startCharacter, 3);
    assert.equal(heading_headingId[0]?.endCharacter, 6);
    assert.equal(heading_headingId[0]?.snippet, "@h1");
    assert.equal(heading_headingId[0]?.matchedSnippet, "@h1");
    assert.equal(heading_headingId[0]?.sourceLine, sourceLine);
    assert.deepEqual(heading_headingId[0]?.titleRanges, [{
      startCharacter: 7,
      endCharacter: 24,
    }]);

    const contextual_headingId = scanDocument(
      sourceLine,
      "regex-context",
      [{
        snippet: "@h1",
        level: 1,
        labelTemplate: "${before}|${after}|${line}",
        labelRegex: { pattern: "\\s*-+\\s*$", replacement: "" },
      }],
      true,
    );
    assert.equal(
      contextual_headingId[0]?.label,
      "## | This is the title|## @h1 This is the title -----------------",
    );
  });

  it("supports mixed regex and raw triggers with capture and non-match behavior", (): void => {
    const trigger_triggerId: TriggerDefinition[] = [
      {
        snippet: "@h1",
        level: 1,
        labelTemplate: "Part ${after}",
        labelRegex: { pattern: "^\\s*\\[(.+?)\\]\\s*$", replacement: "$1" },
      },
      {
        snippet: "@h2",
        level: 2,
        labelTemplate: "${after}",
        labelRegex: { pattern: "\\s*-+\\s*$", replacement: "" },
      },
      { snippet: "@h3", level: 3, labelTemplate: "${after}" },
    ];
    const heading_headingId = scanDocument(
      "@h1 [Captured title]\n@h2 Non-match fallback\n@h3 Raw title -----",
      "mixed-regex",
      trigger_triggerId,
      true,
    );

    assert.deepEqual(
      heading_headingId.map((heading) => heading.label),
      ["Part Captured title", "Non-match fallback", "Raw title -----"],
    );
  });

  it("falls back to raw after-text for a directly constructed invalid regex", (): void => {
    const invalidTrigger: TriggerDefinition = {
      snippet: "@h1",
      level: 1,
      labelTemplate: "${after}",
      labelRegex: { pattern: "[", replacement: "" },
    };

    assert.doesNotThrow((): void => {
      const heading_headingId = scanDocument(
        "@h1 Raw title ----",
        "invalid-regex",
        [invalidTrigger],
        true,
      );
      assert.equal(heading_headingId[0]?.label, "Raw title ----");
      assert.deepEqual(heading_headingId[0]?.titleRanges, [{
        startCharacter: 4,
        endCharacter: 18,
      }]);
    });
  });

  it("uses a trusted parsed expression without compiling the label regex again", (): void => {
    const parsed = parseTriggerDefinitions([{
      snippet: "@h1",
      level: 1,
      labelRegex: { pattern: "\\s*-+\\s*$", replacement: "" },
    }]);
    const trigger = parsed.trigger_triggerId[0];
    assert.equal(trigger?.labelExpression?.source, "\\s*-+\\s*$");
    assert.equal(trigger?.labelExpression?.flags, "du");

    const originalRegExp = globalThis.RegExp;
    let regexpConstructionCount = 0;
    globalThis.RegExp = new Proxy(originalRegExp, {
      construct(target, argument_argumentId, newTarget): RegExp {
        regexpConstructionCount += 1;
        return Reflect.construct(target, argument_argumentId, newTarget) as RegExp;
      },
    });

    try {
      const heading_headingId = scanDocument(
        "@h1 Parsed title -----",
        "parsed-regex",
        parsed.trigger_triggerId,
        true,
      );
      assert.equal(heading_headingId[0]?.label, "Parsed title");
    } finally {
      globalThis.RegExp = originalRegExp;
    }

    assert.equal(
      regexpConstructionCount,
      1,
      "only the literal trigger matcher should be compiled during scanning",
    );
  });

  it("maps template placeholders and excludes generated-only labels", (): void => {
    const headings = scanDocument(
      "pre @h1 after\n@h1 source\n@h1   ",
      "template-ranges",
      [
        {
          snippet: "@h1",
          level: 1,
          labelTemplate: " ${after}|${trigger}|${before}|${line}|${after}|${lineNumber} ",
        },
      ],
      true,
    );
    const constant = scanDocument(
      "@h1 Same as source",
      "constant",
      [{ snippet: "@h1", level: 1, labelTemplate: "Same as source" }],
      true,
    )[0];
    const untitled = scanDocument(
      "@h1   ",
      "untitled",
      [{ snippet: "@h1", level: 1, labelTemplate: "${after}" }],
      true,
    )[0];
    const lineNumber = scanDocument(
      "@h1 source",
      "line-number",
      [{ snippet: "@h1", level: 1, labelTemplate: "Line ${lineNumber}" }],
      true,
    )[0];

    assert.deepEqual(headings[0]?.titleRanges, [{ startCharacter: 0, endCharacter: 13 }]);
    assert.deepEqual(headings[1]?.titleRanges, [{ startCharacter: 0, endCharacter: 10 }]);
    assert.deepEqual(headings[2]?.titleRanges, [{ startCharacter: 0, endCharacter: 6 }]);
    assert.deepEqual(constant?.titleRanges, []);
    assert.deepEqual(untitled?.titleRanges, []);
    assert.equal(lineNumber?.label, "Line 1");
    assert.deepEqual(lineNumber?.titleRanges, []);
  });

  it("keeps delimiter precedence when directly constructed definitions conflict", (): void => {
    const heading = scanDocument(
      "@h1 [[ Title ]]",
      "conflict",
      [{
        snippet: "@h1",
        level: 1,
        labelTemplate: "${after}",
        labelDelimiters: { start: "[[", end: "]]" },
        labelRegex: { pattern: ".*", replacement: "generated" },
      }],
      true,
    )[0];

    assert.equal(heading?.label, "Title");
    assert.deepEqual(heading?.titleRanges, [{ startCharacter: 7, endCharacter: 12 }]);
  });
});
