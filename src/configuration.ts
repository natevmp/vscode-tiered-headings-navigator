import type { TriggerDefinition } from "./model";
import { literalSnippetsEqual } from "./literal";
import { findUnsupportedPlaceholder } from "./template";

export interface ConfigurationIssue {
  readonly triggerIndex: number | null;
  readonly message: string;
}

export interface TriggerConfigurationResult {
  readonly trigger_triggerId: TriggerDefinition[];
  readonly issue_issueId: ConfigurationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const allowedTriggerKeys = new Set(["snippet", "level", "labelTemplate"]);

/** Parses untrusted trigger configuration while retaining every valid definition. */
export function parseTriggerDefinitions(
  raw: unknown,
  caseSensitive = true,
): TriggerConfigurationResult {
  const trigger_triggerId: TriggerDefinition[] = [];
  const issue_issueId: ConfigurationIssue[] = [];

  if (!Array.isArray(raw)) {
    issue_issueId.push({
      triggerIndex: null,
      message: "Heading triggers must be an array.",
    });
    return { trigger_triggerId, issue_issueId };
  }

  raw.forEach((item: unknown, triggerIndex: number): void => {
    if (!isRecord(item)) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} must be an object.`,
      });
      return;
    }

    let valid = true;
    const snippet = item.snippet;
    const level = item.level;
    const rawTemplate = item.labelTemplate;

    Object.keys(item).forEach((key: string): void => {
      if (!allowedTriggerKeys.has(key)) {
        issue_issueId.push({
          triggerIndex,
          message: `Trigger ${triggerIndex + 1} contains unsupported property "${key}".`,
        });
      }
    });

    if (typeof snippet !== "string" || snippet.length === 0) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} must have a non-empty string snippet.`,
      });
      valid = false;
    } else if (/[\r\n]/.test(snippet)) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} snippet cannot contain a line break.`,
      });
      valid = false;
    }

    if (typeof level !== "number" || !Number.isInteger(level) || level < 1) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} must have an integer level of at least 1.`,
      });
      valid = false;
    }

    let labelTemplate = "${after}";
    if (rawTemplate !== undefined && typeof rawTemplate !== "string") {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} labelTemplate must be a string.`,
      });
    } else if (typeof rawTemplate === "string") {
      const unsupportedPlaceholder = findUnsupportedPlaceholder(rawTemplate);
      if (unsupportedPlaceholder === undefined) {
        labelTemplate = rawTemplate;
      } else {
        issue_issueId.push({
          triggerIndex,
          message: `Trigger ${triggerIndex + 1} labelTemplate contains unsupported placeholder ${unsupportedPlaceholder}.`,
        });
      }
    }

    if (!valid || typeof snippet !== "string" || typeof level !== "number") {
      return;
    }

    const duplicate = trigger_triggerId.some(
      (trigger: TriggerDefinition): boolean => literalSnippetsEqual(
        trigger.snippet,
        snippet,
        caseSensitive,
      ),
    );
    if (duplicate) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} duplicates the snippet "${snippet}".`,
      });
      return;
    }

    trigger_triggerId.push({ snippet, level, labelTemplate });
  });

  return { trigger_triggerId, issue_issueId };
}
