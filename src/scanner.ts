import type { Heading, TriggerDefinition } from "./model";
import { createLiteralExpression } from "./literal";
import { formatHeadingLabel } from "./template";

interface TriggerMatcher {
  readonly definition: TriggerDefinition;
  readonly expression: RegExp;
  readonly configurationOrder: number;
}

interface MatchCandidate {
  readonly matcher: TriggerMatcher;
  readonly startCharacter: number;
  readonly matchedSnippet: string;
}

function isPreferredMatch(candidate: MatchCandidate, current: MatchCandidate): boolean {
  if (candidate.startCharacter !== current.startCharacter) {
    return candidate.startCharacter < current.startCharacter;
  }
  if (candidate.matcher.definition.snippet.length !== current.matcher.definition.snippet.length) {
    return candidate.matcher.definition.snippet.length > current.matcher.definition.snippet.length;
  }
  return candidate.matcher.configurationOrder < current.matcher.configurationOrder;
}

function createHeadingId(
  documentIdentity: string,
  definition: TriggerDefinition,
  ordinal: number,
): string {
  return `heading:${JSON.stringify([
    documentIdentity,
    definition.snippet,
    ordinal,
  ])}`;
}

/** Scans a complete document and returns at most one heading per physical line. */
export function scanDocument(
  documentText: string,
  documentIdentity: string,
  trigger_triggerId: readonly TriggerDefinition[],
  caseSensitive: boolean,
): Heading[] {
  const matcher_triggerId: TriggerMatcher[] = trigger_triggerId.map(
    (definition: TriggerDefinition, configurationOrder: number): TriggerMatcher => ({
      definition,
      expression: createLiteralExpression(definition.snippet, caseSensitive),
      configurationOrder,
    }),
  );
  const sourceLine_lineId = documentText.split(/\r\n|\n|\r/);
  const heading_headingId: Heading[] = [];
  const ordinalByTriggerKey = new Map<string, number>();

  sourceLine_lineId.forEach((sourceLine: string, line: number): void => {
    let selected: MatchCandidate | undefined;

    matcher_triggerId.forEach((matcher: TriggerMatcher): void => {
      const match = matcher.expression.exec(sourceLine);
      if (match === null || match.index === undefined) {
        return;
      }

      const matchedSnippet = match[0];
      const candidate: MatchCandidate = {
        matcher,
        startCharacter: match.index,
        matchedSnippet,
      };
      if (selected === undefined || isPreferredMatch(candidate, selected)) {
        selected = candidate;
      }
    });

    if (selected === undefined) {
      return;
    }

    const { definition } = selected.matcher;
    const endCharacter = selected.startCharacter + selected.matchedSnippet.length;
    const label = formatHeadingLabel(definition.labelTemplate, {
      after: sourceLine.slice(endCharacter),
      before: sourceLine.slice(0, selected.startCharacter),
      line: sourceLine,
      trigger: selected.matchedSnippet,
      lineNumber: line + 1,
    });
    const triggerKey = JSON.stringify([
      documentIdentity,
      definition.snippet,
    ]);
    const ordinal = ordinalByTriggerKey.get(triggerKey) ?? 0;
    ordinalByTriggerKey.set(triggerKey, ordinal + 1);

    heading_headingId.push({
      id: createHeadingId(documentIdentity, definition, ordinal),
      documentIdentity,
      level: definition.level,
      snippet: definition.snippet,
      matchedSnippet: selected.matchedSnippet,
      label,
      line,
      startCharacter: selected.startCharacter,
      endCharacter,
      sourceLine,
    });
  });

  return heading_headingId;
}
