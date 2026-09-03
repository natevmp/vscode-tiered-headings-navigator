import assert from "node:assert/strict";

import { findUnsupportedPlaceholder, formatHeadingLabel } from "../../src/template";

describe("heading label templates", (): void => {
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

  it("identifies unsupported placeholders", (): void => {
    assert.equal(findUnsupportedPlaceholder("${after} ${title}"), "${title}");
    assert.equal(findUnsupportedPlaceholder("${after} ${lineNumber}"), undefined);
  });
});
