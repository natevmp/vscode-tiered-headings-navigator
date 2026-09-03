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
