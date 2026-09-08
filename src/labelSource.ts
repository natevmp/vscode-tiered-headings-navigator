import type { HeadingTitleRange } from "./model";

interface LabelSourceSegment {
  readonly text: string;
  readonly sourceStart: number | undefined;
}

/** Label text paired with the line-relative source spans that produced it. */
export interface MappedLabel {
  readonly text: string;
  readonly segments: readonly LabelSourceSegment[];
}

function createMappedLabel(segments: readonly LabelSourceSegment[]): MappedLabel {
  const compacted: LabelSourceSegment[] = [];

  segments.forEach((segment: LabelSourceSegment): void => {
    if (segment.text.length === 0) {
      return;
    }

    const previous = compacted[compacted.length - 1];
    const contiguousSource = previous?.sourceStart !== undefined
      && segment.sourceStart !== undefined
      && previous.sourceStart + previous.text.length === segment.sourceStart;
    const bothGenerated = previous !== undefined
      && previous.sourceStart === undefined
      && segment.sourceStart === undefined;
    if (previous !== undefined && (contiguousSource || bothGenerated)) {
      compacted[compacted.length - 1] = {
        text: previous.text + segment.text,
        sourceStart: previous.sourceStart,
      };
    } else {
      compacted.push(segment);
    }
  });

  return {
    text: compacted.map((segment: LabelSourceSegment): string => segment.text).join(""),
    segments: compacted,
  };
}

/** Creates text copied directly from one contiguous source-line span. */
export function sourceLabel(text: string, sourceStart: number): MappedLabel {
  return createMappedLabel([{ text, sourceStart }]);
}

/** Creates label text that was generated rather than copied from the source line. */
export function generatedLabel(text: string): MappedLabel {
  return createMappedLabel([{ text, sourceStart: undefined }]);
}

/** Concatenates mapped text without losing repeated or reordered source fragments. */
export function concatenateLabels(labels: readonly MappedLabel[]): MappedLabel {
  return createMappedLabel(labels.flatMap(
    (label: MappedLabel): readonly LabelSourceSegment[] => label.segments,
  ));
}

/** Slices mapped text by UTF-16 offsets while preserving corresponding source offsets. */
export function sliceLabel(
  label: MappedLabel,
  start: number,
  end = label.text.length,
): MappedLabel {
  const boundedStart = Math.max(0, Math.min(label.text.length, start));
  const boundedEnd = Math.max(boundedStart, Math.min(label.text.length, end));
  const segments: LabelSourceSegment[] = [];
  let outputOffset = 0;

  label.segments.forEach((segment: LabelSourceSegment): void => {
    const segmentEnd = outputOffset + segment.text.length;
    const overlapStart = Math.max(boundedStart, outputOffset);
    const overlapEnd = Math.min(boundedEnd, segmentEnd);
    if (overlapStart < overlapEnd) {
      const relativeStart = overlapStart - outputOffset;
      segments.push({
        text: segment.text.slice(relativeStart, overlapEnd - outputOffset),
        sourceStart: segment.sourceStart === undefined
          ? undefined
          : segment.sourceStart + relativeStart,
      });
    }
    outputOffset = segmentEnd;
  });

  return createMappedLabel(segments);
}

/** Applies JavaScript's String.trim semantics to mapped label text. */
export function trimLabel(label: MappedLabel): MappedLabel {
  const start = label.text.length - label.text.trimStart().length;
  const end = label.text.trimEnd().length;
  return sliceLabel(label, start, Math.max(start, end));
}

/** Returns canonical source spans for all source-backed text still in the label. */
export function labelTitleRanges(label: MappedLabel): HeadingTitleRange[] {
  const sorted = label.segments
    .flatMap((segment: LabelSourceSegment): HeadingTitleRange[] => {
      if (segment.sourceStart === undefined || segment.text.length === 0) {
        return [];
      }
      return [{
        startCharacter: segment.sourceStart,
        endCharacter: segment.sourceStart + segment.text.length,
      }];
    })
    .sort((left: HeadingTitleRange, right: HeadingTitleRange): number => (
      left.startCharacter - right.startCharacter
      || left.endCharacter - right.endCharacter
    ));
  const merged: HeadingTitleRange[] = [];

  sorted.forEach((range: HeadingTitleRange): void => {
    const previous = merged[merged.length - 1];
    if (previous === undefined || range.startCharacter > previous.endCharacter) {
      merged.push(range);
      return;
    }
    if (range.endCharacter > previous.endCharacter) {
      merged[merged.length - 1] = {
        startCharacter: previous.startCharacter,
        endCharacter: range.endCharacter,
      };
    }
  });

  return merged;
}
