/** Minimal heading data needed to calculate native editor folding ranges. */
export interface FoldingHeading {
  readonly level: number;
  readonly line: number;
}

/** A zero-based, inclusive line range independent of the VS Code API. */
export interface HeadingFoldingRange {
  readonly startLine: number;
  readonly endLine: number;
}

interface OpenHeading {
  readonly headingIndex: number;
  readonly level: number;
  readonly line: number;
}

/** Calculates source-ordered, non-crossing ranges from source-ordered headings. */
export function calculateHeadingFoldingRanges(
  heading_headingId: readonly FoldingHeading[],
  documentLineCount: number,
): HeadingFoldingRange[] {
  const range_headingId = heading_headingId.map(
    (): HeadingFoldingRange | undefined => undefined,
  );
  const openHeading_stackId: OpenHeading[] = [];

  const closeHeading = (heading: OpenHeading, endLine: number): void => {
    if (endLine > heading.line) {
      range_headingId[heading.headingIndex] = {
        startLine: heading.line,
        endLine,
      };
    }
  };

  heading_headingId.forEach((heading: FoldingHeading, headingIndex: number): void => {
    let openHeading = openHeading_stackId[openHeading_stackId.length - 1];
    while (openHeading !== undefined && openHeading.level >= heading.level) {
      openHeading_stackId.pop();
      closeHeading(openHeading, heading.line - 1);
      openHeading = openHeading_stackId[openHeading_stackId.length - 1];
    }
    openHeading_stackId.push({
      headingIndex,
      level: heading.level,
      line: heading.line,
    });
  });

  const documentEndLine = documentLineCount - 1;
  openHeading_stackId.forEach((heading: OpenHeading): void => {
    closeHeading(heading, documentEndLine);
  });

  return range_headingId.filter(
    (range: HeadingFoldingRange | undefined): range is HeadingFoldingRange => (
      range !== undefined
    ),
  );
}
