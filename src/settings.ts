import * as vscode from "vscode";

import {
  buildHeadingStyleMap,
  defaultLevelStyle_level,
  parseLevelStyleDefinitions,
  parseTriggerDefinitions,
  type ConfigurationIssue,
} from "./configuration";
import type {
  HeadingStyleMap,
  LevelStyleDefinition,
  TriggerDefinition,
} from "./model";

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
      settingKey: settingName,
      message: `${settingName} must be a boolean; using ${String(defaultValue)}.`,
    },
  };
}

export interface HeadingSettings {
  readonly caseSensitive: boolean;
  readonly foldingEnabled: boolean;
  readonly foldingSyncFromNavigator: boolean;
  readonly gutterEnabled: boolean;
  readonly trigger_triggerId: TriggerDefinition[];
  readonly levelStyle_level: readonly LevelStyleDefinition[];
  readonly styleByLevel: HeadingStyleMap;
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
  const foldingEnabledResult = parseBooleanSetting(
    configuration.get<unknown>("folding.enabled", true),
    true,
    "tieredHeadings.folding.enabled",
  );
  const foldingSyncFromNavigatorResult = parseBooleanSetting(
    configuration.get<unknown>("folding.syncFromNavigator", false),
    false,
    "tieredHeadings.folding.syncFromNavigator",
  );
  const rawTriggers = configuration.get<unknown>("triggers", []);
  const triggerResult = parseTriggerDefinitions(rawTriggers, caseSensitiveResult.value);
  const rawLevelStyles = configuration.get<unknown>(
    "editor.levelStyles",
    defaultLevelStyle_level,
  );
  const levelStyleResult = parseLevelStyleDefinitions(rawLevelStyles);
  const issue_issueId: ConfigurationIssue[] = [];
  if (caseSensitiveResult.issue !== undefined) {
    issue_issueId.push(caseSensitiveResult.issue);
  }
  if (gutterEnabledResult.issue !== undefined) {
    issue_issueId.push(gutterEnabledResult.issue);
  }
  if (foldingEnabledResult.issue !== undefined) {
    issue_issueId.push(foldingEnabledResult.issue);
  }
  if (foldingSyncFromNavigatorResult.issue !== undefined) {
    issue_issueId.push(foldingSyncFromNavigatorResult.issue);
  }
  issue_issueId.push(...triggerResult.issue_issueId, ...levelStyleResult.issue_issueId);

  return {
    caseSensitive: caseSensitiveResult.value,
    foldingEnabled: foldingEnabledResult.value,
    foldingSyncFromNavigator: foldingSyncFromNavigatorResult.value,
    gutterEnabled: gutterEnabledResult.value,
    trigger_triggerId: triggerResult.trigger_triggerId,
    levelStyle_level: levelStyleResult.levelStyle_level,
    styleByLevel: buildHeadingStyleMap(levelStyleResult.levelStyle_level),
    issue_issueId,
  };
}

export function affectsHeadingSettings(
  event: vscode.ConfigurationChangeEvent,
  resource?: vscode.Uri,
): boolean {
  return event.affectsConfiguration(configurationSection, resource);
}
