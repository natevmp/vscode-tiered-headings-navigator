import * as vscode from "vscode";

import {
  parseTriggerDefinitions,
  type ConfigurationIssue,
} from "./configuration";
import type { TriggerDefinition } from "./model";

const configurationSection = "tieredHeadings";

interface BooleanSettingResult {
  readonly value: boolean;
  readonly issue?: ConfigurationIssue;
}

function parseBooleanSetting(
  rawValue: unknown,
  defaultValue: boolean,
  settingName: string,
): BooleanSettingResult {
  if (typeof rawValue === "boolean") {
    return { value: rawValue };
  }
  return {
    value: defaultValue,
    issue: {
      triggerIndex: null,
      message: `${settingName} must be a boolean; using ${String(defaultValue)}.`,
    },
  };
}

export interface HeadingSettings {
  readonly caseSensitive: boolean;
  readonly gutterEnabled: boolean;
  readonly trigger_triggerId: TriggerDefinition[];
  readonly issue_issueId: ConfigurationIssue[];
}

/** Reads and validates settings for a specific document resource. */
export function readHeadingSettings(document: vscode.TextDocument): HeadingSettings {
  const configuration = vscode.workspace.getConfiguration(
    configurationSection,
    document.uri,
  );
  const caseSensitiveResult = parseBooleanSetting(
    configuration.get<unknown>("caseSensitive", true),
    true,
    "tieredHeadings.caseSensitive",
  );
  const gutterEnabledResult = parseBooleanSetting(
    configuration.get<unknown>("gutter.enabled", true),
    true,
    "tieredHeadings.gutter.enabled",
  );
  const rawTriggers = configuration.get<unknown>("triggers", []);
  const result = parseTriggerDefinitions(rawTriggers, caseSensitiveResult.value);
  const issue_issueId: ConfigurationIssue[] = [];
  if (caseSensitiveResult.issue !== undefined) {
    issue_issueId.push(caseSensitiveResult.issue);
  }
  if (gutterEnabledResult.issue !== undefined) {
    issue_issueId.push(gutterEnabledResult.issue);
  }
  issue_issueId.push(...result.issue_issueId);

  return {
    caseSensitive: caseSensitiveResult.value,
    gutterEnabled: gutterEnabledResult.value,
    trigger_triggerId: result.trigger_triggerId,
    issue_issueId,
  };
}

export function affectsHeadingSettings(
  event: vscode.ConfigurationChangeEvent,
  resource?: vscode.Uri,
): boolean {
  return event.affectsConfiguration(configurationSection, resource);
}
