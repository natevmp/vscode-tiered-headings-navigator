/** Literal delimiters used to extract a title after a matched trigger. */
export interface LabelDelimiters {
  readonly start: string;
  readonly end: string;
}

/** A validated, literal heading trigger. */
export interface TriggerDefinition {
  readonly snippet: string;
  readonly level: number;
  readonly labelTemplate: string;
  readonly labelDelimiters?: LabelDelimiters;
}

/** Whole-line text styles supported for detected headings. */
export type HeadingTextStyle = "normal" | "bold" | "italic" | "boldItalic";

/** Resolved whole-line styles keyed by positive heading level. */
export type HeadingStyleMap = ReadonlyMap<number, HeadingTextStyle>;

/** A validated text style associated with a positive heading level. */
export interface LevelStyleDefinition {
  readonly level: number;
  readonly style: HeadingTextStyle;
}

/** A heading detected in a document. Character positions are zero-based. */
export interface Heading {
  readonly id: string;
  readonly documentIdentity: string;
  readonly level: number;
  readonly snippet: string;
  readonly matchedSnippet: string;
  readonly label: string;
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly sourceLine: string;
}

/** A detected heading with its direct descendants. */
export interface HeadingNode extends Heading {
  readonly heading_childId: HeadingNode[];
}

/** Immutable context used to reject commands issued from an obsolete tree model. */
export interface HeadingNavigationTarget {
  readonly headingId: string;
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly modelGeneration: number;
}
