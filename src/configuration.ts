import type {
  HeadingStyleMap,
  HeadingTextStyle,
  LabelDelimiters,
  LevelStyleDefinition,
  TriggerDefinition,
} from "./model";
import { literalSnippetsEqual } from "./literal";
import { findUnsupportedPlaceholder } from "./template";

export interface ConfigurationIssue {
  readonly triggerIndex?: number | null;
  readonly levelStyleIndex?: number | null;
  readonly settingKey?: string;
  readonly message: string;
}

export interface TriggerConfigurationResult {
  readonly trigger_triggerId: TriggerDefinition[];
  readonly issue_issueId: ConfigurationIssue[];
}

export interface LevelStyleConfigurationResult {
  readonly levelStyle_level: LevelStyleDefinition[];
  readonly issue_issueId: ConfigurationIssue[];
}

/** Default whole-line styles used when the setting is absent or malformed. */
export const defaultLevelStyle_level: readonly LevelStyleDefinition[] = Object.freeze([
  Object.freeze({ level: 1, style: "bold" }),
  Object.freeze({ level: 2, style: "boldItalic" }),
  Object.freeze({ level: 3, style: "italic" }),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const allowedTriggerKeys = new Set([
  "snippet",
  "level",
  "labelTemplate",
  "labelDelimiters",
]);
const allowedLabelDelimiterKeys = new Set(["start", "end"]);
const allowedLevelStyleKeys = new Set(["level", "style"]);
const triggerSettingKey = "tieredHeadings.triggers";
const levelStyleSettingKey = "tieredHeadings.editor.levelStyles";
const supportedHeadingStyles = new Set<HeadingTextStyle>([
  "normal",
  "bold",
  "italic",
  "boldItalic",
]);

function attachSettingKey(
  issue_issueId: readonly ConfigurationIssue[],
  settingKey: string,
): ConfigurationIssue[] {
  return issue_issueId.map((issue: ConfigurationIssue): ConfigurationIssue => ({
    ...issue,
    settingKey,
  }));
}

function parseLabelDelimiters(
  raw: unknown,
  triggerIndex: number,
  issue_issueId: ConfigurationIssue[],
): LabelDelimiters | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    issue_issueId.push({
      triggerIndex,
      message: `Trigger ${triggerIndex + 1} labelDelimiters must be an object.`,
    });
    return undefined;
  }

  let valid = true;
  Object.keys(raw).forEach((key: string): void => {
    if (!allowedLabelDelimiterKeys.has(key)) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} labelDelimiters contains unsupported property "${key}".`,
      });
      valid = false;
    }
  });

  const validateDelimiter = (field: "start" | "end"): string | undefined => {
    const value = raw[field];
    if (typeof value !== "string" || value.length === 0) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} labelDelimiters.${field} must be a non-empty string.`,
      });
      valid = false;
      return undefined;
    }
    if (/[\r\n]/.test(value)) {
      issue_issueId.push({
        triggerIndex,
        message: `Trigger ${triggerIndex + 1} labelDelimiters.${field} cannot contain a line break.`,
      });
      valid = false;
      return undefined;
    }
    return value;
  };

  const start = validateDelimiter("start");
  const end = validateDelimiter("end");
  return valid && start !== undefined && end !== undefined
    ? { start, end }
    : undefined;
}

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
    return {
      trigger_triggerId,
      issue_issueId: attachSettingKey(issue_issueId, triggerSettingKey),
    };
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
    const labelDelimiters = parseLabelDelimiters(
      item.labelDelimiters,
      triggerIndex,
      issue_issueId,
    );

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

    trigger_triggerId.push(labelDelimiters === undefined
      ? { snippet, level, labelTemplate }
      : { snippet, level, labelTemplate, labelDelimiters });
  });

  return {
    trigger_triggerId,
    issue_issueId: attachSettingKey(issue_issueId, triggerSettingKey),
  };
}

/** Parses untrusted whole-line style configuration while retaining valid entries. */
export function parseLevelStyleDefinitions(raw: unknown): LevelStyleConfigurationResult {
  const levelStyle_level: LevelStyleDefinition[] = [];
  const issue_issueId: ConfigurationIssue[] = [];
  const seenLevels = new Set<number>();

  if (!Array.isArray(raw)) {
    issue_issueId.push({
      levelStyleIndex: null,
      message: "Heading level styles must be an array; using the defaults.",
    });
    return {
      levelStyle_level: defaultLevelStyle_level.map(
        (definition: LevelStyleDefinition): LevelStyleDefinition => ({ ...definition }),
      ),
      issue_issueId: attachSettingKey(issue_issueId, levelStyleSettingKey),
    };
  }

  raw.forEach((item: unknown, levelStyleIndex: number): void => {
    if (!isRecord(item)) {
      issue_issueId.push({
        levelStyleIndex,
        message: `Level style ${levelStyleIndex + 1} must be an object.`,
      });
      return;
    }

    let valid = true;
    const level = item.level;
    const style = item.style;

    Object.keys(item).forEach((key: string): void => {
      if (!allowedLevelStyleKeys.has(key)) {
        issue_issueId.push({
          levelStyleIndex,
          message: `Level style ${levelStyleIndex + 1} contains unsupported property "${key}".`,
        });
      }
    });

    if (typeof level !== "number" || !Number.isInteger(level) || level < 1) {
      issue_issueId.push({
        levelStyleIndex,
        message: `Level style ${levelStyleIndex + 1} must have an integer level of at least 1.`,
      });
      valid = false;
    }

    if (typeof style !== "string" || !supportedHeadingStyles.has(style as HeadingTextStyle)) {
      issue_issueId.push({
        levelStyleIndex,
        message: `Level style ${levelStyleIndex + 1} must use normal, bold, italic, or boldItalic.`,
      });
      valid = false;
    }

    if (!valid || typeof level !== "number" || typeof style !== "string") {
      return;
    }

    if (seenLevels.has(level)) {
      issue_issueId.push({
        levelStyleIndex,
        message: `Level style ${levelStyleIndex + 1} duplicates heading level ${level}.`,
      });
      return;
    }

    seenLevels.add(level);
    levelStyle_level.push({ level, style: style as HeadingTextStyle });
  });

  return {
    levelStyle_level,
    issue_issueId: attachSettingKey(issue_issueId, levelStyleSettingKey),
  };
}

/** Builds the level lookup consumed by editor decoration logic. */
export function buildHeadingStyleMap(
  levelStyle_level: readonly LevelStyleDefinition[],
): HeadingStyleMap {
  return new Map(
    levelStyle_level.map(
      (definition: LevelStyleDefinition): readonly [number, HeadingTextStyle] => [
        definition.level,
        definition.style,
      ],
    ),
  );
}

/** Resolves unlisted levels to normal without requiring a normal decoration. */
export function resolveHeadingTextStyle(
  level: number,
  styleByLevel: HeadingStyleMap,
): HeadingTextStyle {
  return styleByLevel.get(level) ?? "normal";
}
