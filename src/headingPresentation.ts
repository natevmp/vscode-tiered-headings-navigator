import type { Heading } from "./model";

export type HeadingMarkerCategory = "filledCircle" | "openCircle" | "plus" | "dash";

export type HeadingPaneIconPresentation =
  | { readonly kind: "theme"; readonly themeIconId: string }
  | { readonly kind: "asset" };

export interface HeadingMarkerPresentation {
  readonly category: HeadingMarkerCategory;
  readonly paneIcon: HeadingPaneIconPresentation;
  readonly assetName: string;
}

export interface HeadingMarkerRange {
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

export interface HeadingMarkerRangeGroups {
  readonly range_filledCircleId: HeadingMarkerRange[];
  readonly range_openCircleId: HeadingMarkerRange[];
  readonly range_plusId: HeadingMarkerRange[];
  readonly range_dashId: HeadingMarkerRange[];
}

const filledCircleMarker: HeadingMarkerPresentation = Object.freeze({
  category: "filledCircle",
  paneIcon: { kind: "theme" as const, themeIconId: "circle-filled" },
  assetName: "marker-filled-circle.svg",
});
const openCircleMarker: HeadingMarkerPresentation = Object.freeze({
  category: "openCircle",
  paneIcon: { kind: "theme" as const, themeIconId: "circle-outline" },
  assetName: "marker-open-circle.svg",
});
const plusMarker: HeadingMarkerPresentation = Object.freeze({
  category: "plus",
  paneIcon: { kind: "asset" as const },
  assetName: "marker-plus.svg",
});
const dashMarker: HeadingMarkerPresentation = Object.freeze({
  category: "dash",
  paneIcon: { kind: "theme" as const, themeIconId: "dash" },
  assetName: "marker-dash.svg",
});

/** Resolves the presentation associated with a marker category. */
export function getHeadingMarkerPresentationForCategory(
  category: HeadingMarkerCategory,
): HeadingMarkerPresentation {
  switch (category) {
    case "filledCircle":
      return filledCircleMarker;
    case "openCircle":
      return openCircleMarker;
    case "plus":
      return plusMarker;
    case "dash":
      return dashMarker;
  }
}

/** Resolves the shared pane and gutter presentation for a heading level. */
export function getHeadingMarkerPresentation(level: number): HeadingMarkerPresentation {
  if (level === 1) {
    return getHeadingMarkerPresentationForCategory("filledCircle");
  }
  if (level === 2) {
    return getHeadingMarkerPresentationForCategory("openCircle");
  }
  if (level === 3) {
    return getHeadingMarkerPresentationForCategory("plus");
  }
  return getHeadingMarkerPresentationForCategory("dash");
}

/** Groups trigger ranges by marker in one pass, or returns empty groups when disabled. */
export function groupHeadingMarkerRanges(
  heading_headingId: readonly Heading[],
  enabled = true,
): HeadingMarkerRangeGroups {
  const range_filledCircleId: HeadingMarkerRange[] = [];
  const range_openCircleId: HeadingMarkerRange[] = [];
  const range_plusId: HeadingMarkerRange[] = [];
  const range_dashId: HeadingMarkerRange[] = [];

  if (!enabled) {
    return {
      range_filledCircleId,
      range_openCircleId,
      range_plusId,
      range_dashId,
    };
  }

  heading_headingId.forEach((heading: Heading): void => {
    const range: HeadingMarkerRange = {
      line: heading.line,
      startCharacter: heading.startCharacter,
      endCharacter: heading.endCharacter,
    };
    switch (getHeadingMarkerPresentation(heading.level).category) {
      case "filledCircle":
        range_filledCircleId.push(range);
        break;
      case "openCircle":
        range_openCircleId.push(range);
        break;
      case "plus":
        range_plusId.push(range);
        break;
      case "dash":
        range_dashId.push(range);
        break;
    }
  });

  return {
    range_filledCircleId,
    range_openCircleId,
    range_plusId,
    range_dashId,
  };
}
