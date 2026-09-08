import type { LabelDelimiters } from "./model";
import {
  concatenateLabels,
  generatedLabel,
  sliceLabel,
  sourceLabel,
  trimLabel,
  type MappedLabel,
} from "./labelSource";

export interface LabelTemplateContext {
  readonly after: string;
  readonly before: string;
  readonly line: string;
  readonly trigger: string;
  readonly lineNumber: number;
}

export interface MappedLabelTemplateContext {
  readonly after: MappedLabel;
  readonly before: MappedLabel;
  readonly line: MappedLabel;
  readonly trigger: MappedLabel;
  readonly lineNumber: number;
}

const supportedPlaceholders = new Set([
  "after",
  "before",
  "line",
  "trigger",
  "lineNumber",
]);

const placeholderPattern = /\$\{([^}]*)\}/g;

/** Extracts a trimmed title only when both delimiters match without overlap. */
export function extractDelimitedAfter(
  after: string,
  delimiters: LabelDelimiters,
): string {
  return extractDelimitedLabelAfter(sourceLabel(after, 0), delimiters).text;
}

/** Extracts a delimited title while retaining its source-line provenance. */
export function extractDelimitedLabelAfter(
  after: MappedLabel,
  delimiters: LabelDelimiters,
): MappedLabel {
  const trimmedAfter = trimLabel(after);
  const titleStart = delimiters.start.length;
  const titleEnd = trimmedAfter.text.length - delimiters.end.length;
  if (
    !trimmedAfter.text.startsWith(delimiters.start)
    || !trimmedAfter.text.endsWith(delimiters.end)
    || titleStart > titleEnd
  ) {
    return after;
  }
  return trimLabel(sliceLabel(trimmedAfter, titleStart, titleEnd));
}

/** Applies one JavaScript replacement to raw text after a matched trigger. */
export function replaceLabelAfter(
  after: string,
  expression: RegExp,
  replacement: string,
): string {
  return after.replace(expression, replacement);
}

function captureLabel(
  after: MappedLabel,
  value: string | undefined,
  indices: readonly [number, number] | undefined,
): MappedLabel {
  if (value === undefined || value.length === 0) {
    return generatedLabel("");
  }
  if (indices === undefined) {
    return generatedLabel(value);
  }

  const captured = sliceLabel(after, indices[0], indices[1]);
  return captured.text === value ? captured : generatedLabel(value);
}

function replacementLabel(
  after: MappedLabel,
  match: RegExpExecArray,
  replacement: string,
): MappedLabel {
  const labels: MappedLabel[] = [];
  const captureCount = match.length - 1;
  let literalStart = 0;
  let index = 0;

  const appendToken = (tokenStart: number, tokenEnd: number, label: MappedLabel): void => {
    labels.push(generatedLabel(replacement.slice(literalStart, tokenStart)), label);
    literalStart = tokenEnd;
    index = tokenEnd;
  };

  while (index < replacement.length) {
    if (replacement[index] !== "$" || index + 1 >= replacement.length) {
      index += 1;
      continue;
    }

    const next = replacement[index + 1];
    if (next === "$") {
      appendToken(index, index + 2, generatedLabel("$"));
    } else if (next === "&") {
      appendToken(index, index + 2, captureLabel(after, match[0], match.indices?.[0]));
    } else if (next === "`") {
      appendToken(index, index + 2, sliceLabel(after, 0, match.index));
    } else if (next === "'") {
      appendToken(
        index,
        index + 2,
        sliceLabel(after, match.index + match[0].length),
      );
    } else if (next === "<" && match.groups !== undefined) {
      const closingIndex = replacement.indexOf(">", index + 2);
      if (closingIndex === -1) {
        index += 1;
        continue;
      }
      const name = replacement.slice(index + 2, closingIndex);
      appendToken(
        index,
        closingIndex + 1,
        captureLabel(after, match.groups[name], match.indices?.groups?.[name]),
      );
    } else if (next !== undefined && /[0-9]/u.test(next)) {
      const following = replacement[index + 2];
      const twoDigitText = following !== undefined && /[0-9]/u.test(following)
        ? next + following
        : undefined;
      const twoDigitIndex = twoDigitText === undefined ? 0 : Number(twoDigitText);
      const oneDigitIndex = Number(next);
      const captureIndex = twoDigitIndex > 0 && twoDigitIndex <= captureCount
        ? twoDigitIndex
        : oneDigitIndex > 0 && oneDigitIndex <= captureCount
          ? oneDigitIndex
          : undefined;
      if (captureIndex === undefined) {
        index += 1;
        continue;
      }
      const tokenEnd = index + (captureIndex === twoDigitIndex ? 3 : 2);
      appendToken(
        index,
        tokenEnd,
        captureLabel(after, match[captureIndex], match.indices?.[captureIndex]),
      );
    } else {
      index += 1;
    }
  }

  labels.push(generatedLabel(replacement.slice(literalStart)));
  return concatenateLabels(labels);
}

/** Applies one replacement while mapping replacement tokens back to source text. */
export function replaceMappedLabelAfter(
  after: MappedLabel,
  expression: RegExp,
  replacement: string,
): MappedLabel {
  const match = expression.exec(after.text);
  if (match === null) {
    return after;
  }

  return concatenateLabels([
    sliceLabel(after, 0, match.index),
    replacementLabel(after, match, replacement),
    sliceLabel(after, match.index + match[0].length),
  ]);
}

/** Returns the first unsupported placeholder, including its template delimiters. */
export function findUnsupportedPlaceholder(template: string): string | undefined {
  placeholderPattern.lastIndex = 0;

  let match = placeholderPattern.exec(template);
  while (match !== null) {
    const placeholder = match[1];
    if (placeholder === undefined || !supportedPlaceholders.has(placeholder)) {
      return match[0];
    }
    match = placeholderPattern.exec(template);
  }

  return undefined;
}

/** Formats and trims a heading label using only the supported placeholders. */
export function formatHeadingLabel(
  template: string,
  context: LabelTemplateContext,
): string {
  return formatMappedHeadingLabel(template, {
    after: generatedLabel(context.after),
    before: generatedLabel(context.before),
    line: generatedLabel(context.line),
    trigger: generatedLabel(context.trigger),
    lineNumber: context.lineNumber,
  }).text;
}

/** Formats a heading label and retains only source fragments used in the result. */
export function formatMappedHeadingLabel(
  template: string,
  context: MappedLabelTemplateContext,
): MappedLabel {
  placeholderPattern.lastIndex = 0;
  const labels: MappedLabel[] = [];
  let templateOffset = 0;
  let match = placeholderPattern.exec(template);
  while (match !== null) {
    labels.push(generatedLabel(template.slice(templateOffset, match.index)));
    const placeholder = match[0];
    const name = match[1];
    switch (name) {
      case "after":
        labels.push(context.after);
        break;
      case "before":
        labels.push(context.before);
        break;
      case "line":
        labels.push(context.line);
        break;
      case "trigger":
        labels.push(context.trigger);
        break;
      case "lineNumber":
        labels.push(generatedLabel(String(context.lineNumber)));
        break;
      default:
        labels.push(generatedLabel(placeholder));
        break;
    }
    templateOffset = match.index + placeholder.length;
    match = placeholderPattern.exec(template);
  }
  labels.push(generatedLabel(template.slice(templateOffset)));
  const label = trimLabel(concatenateLabels(labels));

  return label.text.length > 0
    ? label
    : generatedLabel(`Untitled heading (line ${context.lineNumber})`);
}
