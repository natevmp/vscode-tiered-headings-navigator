import type { Heading, HeadingNode } from "./model";

/** Builds Markdown-style nesting from headings already ordered by source position. */
export function buildHeadingHierarchy(
  heading_headingId: readonly Heading[],
): HeadingNode[] {
  const heading_rootId: HeadingNode[] = [];
  const heading_stackId: HeadingNode[] = [];

  heading_headingId.forEach((heading: Heading): void => {
    while (
      heading_stackId.length > 0
      && heading_stackId[heading_stackId.length - 1]!.level >= heading.level
    ) {
      heading_stackId.pop();
    }

    const node: HeadingNode = { ...heading, heading_childId: [] };
    const parent = heading_stackId[heading_stackId.length - 1];
    if (parent === undefined) {
      heading_rootId.push(node);
    } else {
      parent.heading_childId.push(node);
    }
    heading_stackId.push(node);
  });

  return heading_rootId;
}
