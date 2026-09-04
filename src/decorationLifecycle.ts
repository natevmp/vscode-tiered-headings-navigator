import {
  getHeadingMarkerPresentationForCategory,
  groupHeadingMarkerRanges,
  type HeadingMarkerCategory,
  type HeadingMarkerRange,
} from "./headingPresentation";
import { groupHeadingsByTextStyle } from "./headingStyles";
import type { Heading, HeadingStyleMap } from "./model";

export type HeadingDecorationId =
  | "gutterFilledCircle"
  | "gutterOpenCircle"
  | "gutterPlus"
  | "gutterDash"
  | "bold"
  | "italic"
  | "boldItalic";

export interface GutterDecorationSpecification {
  readonly id: HeadingDecorationId;
  readonly kind: "gutter";
  readonly baseAssetPath: string;
  readonly lightAssetPath: string;
  readonly darkAssetPath: string;
}

export interface TextDecorationSpecification {
  readonly id: HeadingDecorationId;
  readonly kind: "text";
  readonly fontWeight?: "bold";
  readonly fontStyle?: "italic";
}

export type HeadingDecorationSpecification =
  | GutterDecorationSpecification
  | TextDecorationSpecification;

export interface HeadingDecorationAdapter<Editor, Decoration, Range> {
  readonly createDecoration: (
    specification: HeadingDecorationSpecification,
  ) => Decoration;
  readonly createTriggerRange: (range: HeadingMarkerRange) => Range;
  readonly createLineRange: (editor: Editor, heading: Heading) => Range;
  readonly setDecorations: (
    editor: Editor,
    decoration: Decoration,
    range_rangeId: readonly Range[],
  ) => void;
  readonly disposeDecoration: (decoration: Decoration) => void;
}

function createGutterSpecification(
  id: HeadingDecorationId,
  category: HeadingMarkerCategory,
): GutterDecorationSpecification {
  const assetName = getHeadingMarkerPresentationForCategory(category).assetName;
  return Object.freeze({
    id,
    kind: "gutter",
    baseAssetPath: `resources/${assetName}`,
    lightAssetPath: `resources/light/${assetName}`,
    darkAssetPath: `resources/dark/${assetName}`,
  });
}

const filledCircleSpecification = createGutterSpecification(
  "gutterFilledCircle",
  "filledCircle",
);
const openCircleSpecification = createGutterSpecification(
  "gutterOpenCircle",
  "openCircle",
);
const plusSpecification = createGutterSpecification("gutterPlus", "plus");
const dashSpecification = createGutterSpecification("gutterDash", "dash");
const boldSpecification: TextDecorationSpecification = Object.freeze({
  id: "bold",
  kind: "text",
  fontWeight: "bold",
});
const italicSpecification: TextDecorationSpecification = Object.freeze({
  id: "italic",
  kind: "text",
  fontStyle: "italic",
});
const boldItalicSpecification: TextDecorationSpecification = Object.freeze({
  id: "boldItalic",
  kind: "text",
  fontWeight: "bold",
  fontStyle: "italic",
});

/** Owns editor-independent decoration application, cleanup, and disposal. */
export class HeadingDecorationLifecycle<Editor, Decoration, Range> {
  private readonly filledCircleGutterDecoration: Decoration;

  private readonly openCircleGutterDecoration: Decoration;

  private readonly plusGutterDecoration: Decoration;

  private readonly dashGutterDecoration: Decoration;

  private readonly boldDecoration: Decoration;

  private readonly italicDecoration: Decoration;

  private readonly boldItalicDecoration: Decoration;

  private decoratedEditor: Editor | undefined;

  private disposed = false;

  public constructor(
    private readonly adapter: HeadingDecorationAdapter<Editor, Decoration, Range>,
  ) {
    this.filledCircleGutterDecoration = adapter.createDecoration(
      filledCircleSpecification,
    );
    this.openCircleGutterDecoration = adapter.createDecoration(openCircleSpecification);
    this.plusGutterDecoration = adapter.createDecoration(plusSpecification);
    this.dashGutterDecoration = adapter.createDecoration(dashSpecification);
    this.boldDecoration = adapter.createDecoration(boldSpecification);
    this.italicDecoration = adapter.createDecoration(italicSpecification);
    this.boldItalicDecoration = adapter.createDecoration(boldItalicSpecification);
  }

  public update(
    editor: Editor | undefined,
    heading_headingId: readonly Heading[],
    gutterEnabled: boolean,
    styleByLevel: HeadingStyleMap,
  ): void {
    if (this.disposed) {
      return;
    }
    if (this.decoratedEditor !== undefined && this.decoratedEditor !== editor) {
      this.clearEditor(this.decoratedEditor);
      this.decoratedEditor = undefined;
    }
    if (editor === undefined) {
      return;
    }

    const markerRangeGroups = groupHeadingMarkerRanges(heading_headingId, gutterEnabled);
    const gutterRange_filledCircleId = markerRangeGroups.range_filledCircleId.map(
      (range: HeadingMarkerRange): Range => this.adapter.createTriggerRange(range),
    );
    const gutterRange_openCircleId = markerRangeGroups.range_openCircleId.map(
      (range: HeadingMarkerRange): Range => this.adapter.createTriggerRange(range),
    );
    const gutterRange_plusId = markerRangeGroups.range_plusId.map(
      (range: HeadingMarkerRange): Range => this.adapter.createTriggerRange(range),
    );
    const gutterRange_dashId = markerRangeGroups.range_dashId.map(
      (range: HeadingMarkerRange): Range => this.adapter.createTriggerRange(range),
    );
    const styleGroups = groupHeadingsByTextStyle(heading_headingId, styleByLevel);
    const createLineRange = (heading: Heading): Range => (
      this.adapter.createLineRange(editor, heading)
    );
    const boldRange_headingId = styleGroups.heading_boldId.map(createLineRange);
    const italicRange_headingId = styleGroups.heading_italicId.map(createLineRange);
    const boldItalicRange_headingId = styleGroups.heading_boldItalicId.map(createLineRange);

    this.adapter.setDecorations(
      editor,
      this.filledCircleGutterDecoration,
      gutterRange_filledCircleId,
    );
    this.adapter.setDecorations(
      editor,
      this.openCircleGutterDecoration,
      gutterRange_openCircleId,
    );
    this.adapter.setDecorations(editor, this.plusGutterDecoration, gutterRange_plusId);
    this.adapter.setDecorations(editor, this.dashGutterDecoration, gutterRange_dashId);
    this.adapter.setDecorations(editor, this.boldDecoration, boldRange_headingId);
    this.adapter.setDecorations(editor, this.italicDecoration, italicRange_headingId);
    this.adapter.setDecorations(
      editor,
      this.boldItalicDecoration,
      boldItalicRange_headingId,
    );
    this.decoratedEditor = editor;
  }

  private clearEditor(editor: Editor): void {
    this.adapter.setDecorations(editor, this.filledCircleGutterDecoration, []);
    this.adapter.setDecorations(editor, this.openCircleGutterDecoration, []);
    this.adapter.setDecorations(editor, this.plusGutterDecoration, []);
    this.adapter.setDecorations(editor, this.dashGutterDecoration, []);
    this.adapter.setDecorations(editor, this.boldDecoration, []);
    this.adapter.setDecorations(editor, this.italicDecoration, []);
    this.adapter.setDecorations(editor, this.boldItalicDecoration, []);
  }

  public clear(): void {
    if (this.decoratedEditor !== undefined) {
      this.clearEditor(this.decoratedEditor);
      this.decoratedEditor = undefined;
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.clear();
    this.adapter.disposeDecoration(this.filledCircleGutterDecoration);
    this.adapter.disposeDecoration(this.openCircleGutterDecoration);
    this.adapter.disposeDecoration(this.plusGutterDecoration);
    this.adapter.disposeDecoration(this.dashGutterDecoration);
    this.adapter.disposeDecoration(this.boldDecoration);
    this.adapter.disposeDecoration(this.italicDecoration);
    this.adapter.disposeDecoration(this.boldItalicDecoration);
    this.disposed = true;
  }
}
