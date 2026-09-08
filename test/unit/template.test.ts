import assert from "node:assert/strict";

import { labelTitleRanges, sourceLabel } from "../../src/labelSource";
import {
  extractDelimitedAfter,
  findUnsupportedPlaceholder,
  formatHeadingLabel,
  formatMappedHeadingLabel,
  replaceLabelAfter,
  replaceMappedLabelAfter,
} from "../../src/template";

describe("heading label templates", (): void => {
  const indexedExpression = (pattern: string): RegExp => new RegExp(pattern, "du");
  const context = {
    after: " after text ",
    before: "prefix ",
    line: "prefix @h2 after text ",
    trigger: "@h2",
    lineNumber: 12,
  };

  it("supports every documented placeholder", (): void => {
    assert.equal(
      formatHeadingLabel(
        "${before}|${trigger}|${after}|${line}|${lineNumber}",
        context,
      ),
      "prefix |@h2| after text |prefix @h2 after text |12",
    );
  });

  it("replaces repeated placeholders and trims the final output", (): void => {
    assert.equal(
      formatHeadingLabel("  ${trigger} ${trigger}: ${after}  ", context),
      "@h2 @h2:  after text",
    );
  });

  it("uses the line-numbered fallback for blank output", (): void => {
    assert.equal(
      formatHeadingLabel(" ${after} ", { ...context, after: "   " }),
      "Untitled heading (line 12)",
    );
    assert.equal(
      formatHeadingLabel("", context),
      "Untitled heading (line 12)",
    );
  });

  it("removes arbitrary trailing dash counts with one regex replacement", (): void => {
    const expression = /\s*-+\s*$/u;

    assert.equal(
      replaceLabelAfter(" This is the title -", expression, ""),
      " This is the title",
    );
    assert.equal(
      replaceLabelAfter(" This is the title -----------------  ", expression, ""),
      " This is the title",
    );
  });

  it("inherits JavaScript capture replacement behavior", (): void => {
    assert.equal(
      replaceLabelAfter(" [Chapter 12] ", /\[(Chapter) (\d+)\]/u, "$1-$2"),
      " Chapter-12 ",
    );
    assert.equal(
      replaceLabelAfter(" <Named> ", /<(?<title>[^>]+)>/u, "$<title>"),
      " Named ",
    );
  });

  it("leaves non-matching after-text unchanged", (): void => {
    const after = " This title has no suffix ";

    assert.equal(replaceLabelAfter(after, /\s*-+\s*$/u, ""), after);
  });

  it("lets an empty replacement result flow to the existing fallback", (): void => {
    const after = replaceLabelAfter(" --- ", /^\s*-+\s*$/u, "");

    assert.equal(after, "");
    assert.equal(
      formatHeadingLabel("${after}", { ...context, after }),
      "Untitled heading (line 12)",
    );
  });

  it("identifies unsupported placeholders", (): void => {
    assert.equal(findUnsupportedPlaceholder("${after} ${title}"), "${title}");
    assert.equal(findUnsupportedPlaceholder("${after} ${lineNumber}"), undefined);
  });

  it("extracts exact symmetric and asymmetric delimiters after trimming", (): void => {
    assert.equal(
      extractDelimitedAfter("  ---- A title ----  ", { start: "----", end: "----" }),
      "A title",
    );
    assert.equal(
      extractDelimitedAfter(" \t[[ Mixed title >> \t", { start: "[[", end: ">>" }),
      "Mixed title",
    );
  });

  it("falls back atomically to the original text on either mismatch", (): void => {
    assert.equal(
      extractDelimitedAfter("  --- Draft ----  ", { start: "----", end: "----" }),
      "  --- Draft ----  ",
    );
    assert.equal(
      extractDelimitedAfter("  ---- Draft ---  ", { start: "----", end: "----" }),
      "  ---- Draft ---  ",
    );
    assert.equal(
      extractDelimitedAfter("  BEGIN Draft end  ", { start: "BEGIN", end: "END" }),
      "  BEGIN Draft end  ",
      "delimiter matching is case-sensitive",
    );
  });

  it("rejects overlapping delimiter matches and permits an empty interior", (): void => {
    assert.equal(
      extractDelimitedAfter("-----", { start: "----", end: "----" }),
      "-----",
    );
    assert.equal(
      extractDelimitedAfter("--------", { start: "----", end: "----" }),
      "",
    );
  });

  it("maps numbered, named, reordered, nested, and repeated captures by indices", (): void => {
    const cases = [
      {
        input: "[Chapter 12]",
        expression: indexedExpression("^\\[(Chapter) (\\d+)\\]$"),
        replacement: "$2-$1-$2",
        sourceStart: 10,
        ranges: [
          { startCharacter: 11, endCharacter: 18 },
          { startCharacter: 19, endCharacter: 21 },
        ],
      },
      {
        input: "[same same]",
        expression: indexedExpression("^\\[(?<first>same) (?<second>same)\\]$"),
        replacement: "$<second>/$<first>",
        sourceStart: 20,
        ranges: [
          { startCharacter: 21, endCharacter: 25 },
          { startCharacter: 26, endCharacter: 30 },
        ],
      },
      {
        input: "<abcd>",
        expression: indexedExpression("^<((ab)(cd))>$"),
        replacement: "$3/$2/$1",
        sourceStart: 30,
        ranges: [{ startCharacter: 31, endCharacter: 35 }],
      },
    ];

    cases.forEach(({ input, expression, replacement, sourceStart, ranges }): void => {
      const mapped = replaceMappedLabelAfter(
        sourceLabel(input, sourceStart),
        expression,
        replacement,
      );
      assert.equal(mapped.text, input.replace(expression, replacement));
      assert.deepEqual(labelTitleRanges(mapped), ranges);
    });
  });

  it("preserves native prefix, suffix, whole-match, dollar, and literal semantics", (): void => {
    const input = "pre[M]post";
    const expression = indexedExpression("\\[M\\]");
    const replacement = "$`|$&|$'|$$|literal";
    const mapped = replaceMappedLabelAfter(sourceLabel(input, 5), expression, replacement);

    assert.equal(mapped.text, input.replace(expression, replacement));
    assert.deepEqual(labelTitleRanges(mapped), [{ startCharacter: 5, endCharacter: 15 }]);

    const generated = replaceMappedLabelAfter(
      sourceLabel("$same", 40),
      indexedExpression("^\\$same$"),
      "$$same",
    );
    assert.equal(generated.text, "$same");
    assert.deepEqual(labelTitleRanges(generated), []);
  });

  it("uses actual indices for zero-length, lookaround, and unmatched captures", (): void => {
    const cases = [
      {
        input: "abcX",
        expression: indexedExpression("(?<=(abc))X"),
        replacement: "$1",
        ranges: [{ startCharacter: 50, endCharacter: 53 }],
      },
      {
        input: "abc",
        expression: indexedExpression("(?=(b))"),
        replacement: "$1-",
        ranges: [{ startCharacter: 50, endCharacter: 53 }],
      },
      {
        input: "b",
        expression: indexedExpression("^(a)?b$"),
        replacement: "$1",
        ranges: [],
      },
      {
        input: "b",
        expression: indexedExpression("^()b$"),
        replacement: "$1",
        ranges: [],
      },
    ];

    cases.forEach(({ input, expression, replacement, ranges }): void => {
      const mapped = replaceMappedLabelAfter(sourceLabel(input, 50), expression, replacement);
      assert.equal(mapped.text, input.replace(expression, replacement));
      assert.deepEqual(labelTitleRanges(mapped), ranges);
    });
  });

  it("matches native numeric-token fallback and missing named-group behavior", (): void => {
    const cases = [
      {
        input: "abcdefghij",
        expression: indexedExpression("^(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)$"),
        replacement: "$01|$10",
        ranges: [
          { startCharacter: 70, endCharacter: 71 },
          { startCharacter: 79, endCharacter: 80 },
        ],
      },
      {
        input: "ab",
        expression: indexedExpression("^(a)(b)$"),
        replacement: "$10|$20|$03|$99",
        ranges: [{ startCharacter: 70, endCharacter: 72 }],
      },
      {
        input: "a",
        expression: indexedExpression("^(?<present>a)(?<absent>b)?$"),
        replacement: "$<missing>|$<absent>|$<present>",
        ranges: [{ startCharacter: 70, endCharacter: 71 }],
      },
      {
        input: "a",
        expression: indexedExpression("^a$"),
        replacement: "$<missing>",
        ranges: [],
      },
    ];

    cases.forEach(({ input, expression, replacement, ranges }): void => {
      const mapped = replaceMappedLabelAfter(sourceLabel(input, 70), expression, replacement);
      assert.equal(mapped.text, input.replace(expression, replacement));
      assert.deepEqual(labelTitleRanges(mapped), ranges);
    });
  });

  it("maps repeated template placeholders through final trimming", (): void => {
    const mapped = formatMappedHeadingLabel(
      "  literal ${after}|${after}|${before}|${trigger}|${lineNumber}  ",
      {
        after: sourceLabel(" title ", 8),
        before: sourceLabel("pre ", 0),
        line: sourceLabel("pre @h1 title ", 0),
        trigger: sourceLabel("@h1", 4),
        lineNumber: 9,
      },
    );

    assert.equal(mapped.text, "literal  title | title |pre |@h1|9");
    assert.deepEqual(labelTitleRanges(mapped), [
      { startCharacter: 0, endCharacter: 7 },
      { startCharacter: 8, endCharacter: 15 },
    ]);
  });
});
