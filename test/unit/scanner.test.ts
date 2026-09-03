import assert from "node:assert/strict";

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
      })),
      [
        { line: 0, start: 0, end: 1, source: "# one", label: "1: one" },
        { line: 1, start: 3, end: 4, source: "xx # two", label: "2: two" },
        { line: 2, start: 0, end: 1, source: "# three", label: "3: three" },
        { line: 3, start: 7, end: 8, source: "prefix # four", label: "4: four" },
      ],
    );
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
});
