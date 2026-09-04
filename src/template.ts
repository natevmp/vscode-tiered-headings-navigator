import type { LabelDelimiters } from "./model";

export interface LabelTemplateContext {
  readonly after: string;
  readonly before: string;
  readonly line: string;
  readonly trigger: string;
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
  const trimmedAfter = after.trim();
  const titleStart = delimiters.start.length;
  const titleEnd = trimmedAfter.length - delimiters.end.length;
  if (
    !trimmedAfter.startsWith(delimiters.start)
    || !trimmedAfter.endsWith(delimiters.end)
    || titleStart > titleEnd
  ) {
    return after;
  }
  return trimmedAfter.slice(titleStart, titleEnd).trim();
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
  placeholderPattern.lastIndex = 0;
  const label = template.replace(placeholderPattern, (placeholder: string, name: string) => {
    switch (name) {
      case "after":
        return context.after;
      case "before":
        return context.before;
      case "line":
        return context.line;
      case "trigger":
        return context.trigger;
      case "lineNumber":
        return String(context.lineNumber);
      default:
        return placeholder;
    }
  }).trim();

  return label.length > 0
    ? label
    : `Untitled heading (line ${context.lineNumber})`;
}
