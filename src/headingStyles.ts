import { resolveHeadingTextStyle } from "./configuration";
import type { Heading, HeadingStyleMap } from "./model";

export interface HeadingStyleGroups {
  readonly heading_boldId: Heading[];
  readonly heading_italicId: Heading[];
  readonly heading_boldItalicId: Heading[];
}

/** Groups only headings that require a text decoration. */
export function groupHeadingsByTextStyle(
  heading_headingId: readonly Heading[],
  styleByLevel: HeadingStyleMap,
): HeadingStyleGroups {
  const heading_boldId: Heading[] = [];
  const heading_italicId: Heading[] = [];
  const heading_boldItalicId: Heading[] = [];

  heading_headingId.forEach((heading: Heading): void => {
    switch (resolveHeadingTextStyle(heading.level, styleByLevel)) {
      case "bold":
        heading_boldId.push(heading);
        break;
      case "italic":
        heading_italicId.push(heading);
        break;
      case "boldItalic":
        heading_boldItalicId.push(heading);
        break;
      case "normal":
        break;
    }
  });

  return { heading_boldId, heading_italicId, heading_boldItalicId };
}
