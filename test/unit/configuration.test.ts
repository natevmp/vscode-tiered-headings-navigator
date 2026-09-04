import assert from "node:assert/strict";

import { parseTriggerDefinitions } from "../../src/configuration";

describe("parseTriggerDefinitions", (): void => {
  it("rejects non-array input and non-object items", (): void => {
    const nonArrayResult = parseTriggerDefinitions({ snippet: "@h1", level: 1 });
    assert.deepEqual(nonArrayResult.trigger_triggerId, []);
    assert.match(nonArrayResult.issue_issueId[0]?.message ?? "", /must be an array/i);

    const itemResult = parseTriggerDefinitions([null, "@h1", ["@h2"]]);
    assert.equal(itemResult.trigger_triggerId.length, 0);
    assert.equal(itemResult.issue_issueId.length, 3);
    itemResult.issue_issueId.forEach((issue): void => {
      assert.match(issue.message, /must be an object/i);
    });
  });

  it("applies the default label template", (): void => {
    const result = parseTriggerDefinitions([{ snippet: "@h1", level: 1 }]);

    assert.deepEqual(result.trigger_triggerId, [{
      snippet: "@h1",
      level: 1,
      labelTemplate: "${after}",
    }]);
    assert.deepEqual(result.issue_issueId, []);
  });

  it("accepts mixed symmetric and asymmetric label delimiters", (): void => {
    const result = parseTriggerDefinitions([
      {
        snippet: "@h1",
        level: 1,
        labelDelimiters: { start: "----", end: "----" },
      },
      {
        snippet: "@h2",
        level: 2,
        labelDelimiters: { start: "[[", end: ">>" },
      },
      { snippet: "@h3", level: 3 },
    ]);

    assert.deepEqual(result.trigger_triggerId, [
      {
        snippet: "@h1",
        level: 1,
        labelTemplate: "${after}",
        labelDelimiters: { start: "----", end: "----" },
      },
      {
        snippet: "@h2",
        level: 2,
        labelTemplate: "${after}",
        labelDelimiters: { start: "[[", end: ">>" },
      },
      { snippet: "@h3", level: 3, labelTemplate: "${after}" },
    ]);
    assert.deepEqual(result.issue_issueId, []);
  });

  it("reports non-object label delimiters but retains their triggers", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "@h1", level: 1, labelDelimiters: "----" },
      { snippet: "@h2", level: 2, labelDelimiters: [] },
      { snippet: "@h3", level: 3, labelDelimiters: null },
    ]);

    assert.equal(result.trigger_triggerId.length, 3);
    assert.equal(result.issue_issueId.length, 3);
    result.trigger_triggerId.forEach((trigger): void => {
      assert.equal("labelDelimiters" in trigger, false);
    });
    result.issue_issueId.forEach((issue): void => {
      assert.match(issue.message, /labelDelimiters must be an object/i);
    });
  });

  it("reports missing delimiter fields and disables extraction", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "@h1", level: 1, labelDelimiters: { end: "----" } },
      { snippet: "@h2", level: 2, labelDelimiters: { start: "[[" } },
    ]);

    assert.equal(result.trigger_triggerId.length, 2);
    assert.equal(result.issue_issueId.length, 2);
    assert.match(result.issue_issueId[0]?.message ?? "", /\.start.*non-empty string/i);
    assert.match(result.issue_issueId[1]?.message ?? "", /\.end.*non-empty string/i);
    result.trigger_triggerId.forEach((trigger): void => {
      assert.equal(trigger.labelDelimiters, undefined);
    });
  });

  it("reports non-string delimiter fields and disables extraction", (): void => {
    const result = parseTriggerDefinitions([
      {
        snippet: "@h1",
        level: 1,
        labelDelimiters: { start: 4, end: "----" },
      },
      {
        snippet: "@h2",
        level: 2,
        labelDelimiters: { start: "[[", end: false },
      },
    ]);

    assert.equal(result.trigger_triggerId.length, 2);
    assert.equal(result.issue_issueId.length, 2);
    assert.match(result.issue_issueId[0]?.message ?? "", /\.start.*non-empty string/i);
    assert.match(result.issue_issueId[1]?.message ?? "", /\.end.*non-empty string/i);
    result.trigger_triggerId.forEach((trigger): void => {
      assert.equal(trigger.labelDelimiters, undefined);
    });
  });

  it("reports empty and multiline delimiter fields and disables extraction", (): void => {
    const result = parseTriggerDefinitions([
      {
        snippet: "@h1",
        level: 1,
        labelDelimiters: { start: "", end: "----" },
      },
      {
        snippet: "@h2",
        level: 2,
        labelDelimiters: { start: "[[", end: "" },
      },
      {
        snippet: "@h3",
        level: 3,
        labelDelimiters: { start: "<\n<", end: ">>" },
      },
      {
        snippet: "@h4",
        level: 4,
        labelDelimiters: { start: "[[", end: ">\r>" },
      },
    ]);

    assert.equal(result.trigger_triggerId.length, 4);
    assert.equal(result.issue_issueId.length, 4);
    assert.match(result.issue_issueId[0]?.message ?? "", /\.start.*non-empty string/i);
    assert.match(result.issue_issueId[1]?.message ?? "", /\.end.*non-empty string/i);
    assert.match(result.issue_issueId[2]?.message ?? "", /\.start.*line break/i);
    assert.match(result.issue_issueId[3]?.message ?? "", /\.end.*line break/i);
    result.trigger_triggerId.forEach((trigger): void => {
      assert.equal(trigger.labelDelimiters, undefined);
    });
  });

  it("reports unsupported delimiter properties and disables extraction", (): void => {
    const result = parseTriggerDefinitions([{
      snippet: "@h1",
      level: 1,
      labelDelimiters: { start: "----", end: "----", caseSensitive: false },
    }]);

    assert.equal(result.trigger_triggerId.length, 1);
    assert.equal(result.trigger_triggerId[0]?.labelDelimiters, undefined);
    assert.equal(result.issue_issueId.length, 1);
    assert.match(
      result.issue_issueId[0]?.message ?? "",
      /labelDelimiters contains unsupported property.*caseSensitive/i,
    );
  });

  it("rejects empty or multiline snippets and invalid levels", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "", level: 1 },
      { snippet: "@h1\n@h2", level: 1 },
      { snippet: "zero", level: 0 },
      { snippet: "fraction", level: 1.5 },
      { snippet: "text", level: "2" },
    ]);

    assert.equal(result.trigger_triggerId.length, 0);
    assert.equal(result.issue_issueId.length, 5);
    assert.match(result.issue_issueId[0]?.message ?? "", /non-empty string snippet/i);
    assert.match(result.issue_issueId[1]?.message ?? "", /line break/i);
    result.issue_issueId.slice(2).forEach((issue): void => {
      assert.match(issue.message, /integer level/i);
    });
  });

  it("reports invalid templates and safely applies the default", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "@h1", level: 1, labelTemplate: 7 },
      { snippet: "@h2", level: 2, labelTemplate: "${after} ${unknown}" },
    ]);

    assert.equal(result.trigger_triggerId.length, 2);
    assert.equal(result.issue_issueId.length, 2);
    result.trigger_triggerId.forEach((trigger): void => {
      assert.equal(trigger.labelTemplate, "${after}");
    });
    assert.match(result.issue_issueId[0]?.message ?? "", /must be a string/i);
    assert.match(result.issue_issueId[1]?.message ?? "", /unsupported placeholder.*\$\{unknown\}/i);
  });

  it("reports and ignores unsupported properties without losing safe fields", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "@h1", level: 1, labelTemplte: "typo" },
    ]);

    assert.equal(result.trigger_triggerId.length, 1);
    assert.equal(result.trigger_triggerId[0]?.labelTemplate, "${after}");
    assert.match(result.issue_issueId[0]?.message ?? "", /unsupported property.*labelTemplte/i);
  });

  it("rejects later duplicates according to case sensitivity", (): void => {
    const trigger_rawId = [
      { snippet: "@Heading", level: 1 },
      { snippet: "@heading", level: 2 },
    ];

    const sensitiveResult = parseTriggerDefinitions(trigger_rawId, true);
    assert.equal(sensitiveResult.trigger_triggerId.length, 2);
    assert.equal(sensitiveResult.issue_issueId.length, 0);

    const insensitiveResult = parseTriggerDefinitions(trigger_rawId, false);
    assert.equal(insensitiveResult.trigger_triggerId.length, 1);
    assert.equal(insensitiveResult.issue_issueId.length, 1);
    assert.match(insensitiveResult.issue_issueId[0]?.message ?? "", /duplicates/i);
  });

  it("uses matcher-equivalent Unicode case folding for duplicates", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "Σ", level: 1 },
      { snippet: "ς", level: 2 },
      { snippet: "µ", level: 3 },
      { snippet: "μ", level: 4 },
      { snippet: "K", level: 5 },
      { snippet: "K", level: 6 },
      { snippet: "𐐀", level: 7 },
      { snippet: "𐐨", level: 8 },
    ], false);

    assert.deepEqual(
      result.trigger_triggerId.map((trigger) => trigger.snippet),
      ["Σ", "µ", "K", "𐐀"],
    );
    assert.equal(result.issue_issueId.length, 4);
  });

  it("retains valid definitions around invalid definitions", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "@h1", level: 1 },
      { snippet: "@bad", level: -1 },
      { snippet: "@h2", level: 2, labelTemplate: "Section ${after}" },
    ]);

    assert.deepEqual(
      result.trigger_triggerId.map((trigger) => trigger.snippet),
      ["@h1", "@h2"],
    );
    assert.equal(result.issue_issueId.length, 1);
  });

  it("does not let an invalid definition reserve a duplicate snippet", (): void => {
    const result = parseTriggerDefinitions([
      { snippet: "@h1", level: 0 },
      { snippet: "@h1", level: 1 },
    ]);

    assert.equal(result.trigger_triggerId.length, 1);
    assert.equal(result.trigger_triggerId[0]?.level, 1);
    assert.equal(result.issue_issueId.length, 1);
  });
});
