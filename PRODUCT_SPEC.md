# Tiered Headings Navigator — Product Specification

**Status:** Draft v0.1
**Product type:** Visual Studio Code desktop extension

## Summary

Tiered Headings Navigator detects user-defined heading snippets embedded in text documents and displays the resulting headings as a collapsible hierarchy in a new Explorer view.

The view follows the active text editor. Selecting a heading navigates to its source line. Heading levels behave like Markdown heading levels, with smaller integers representing higher-level headings.

## Terminology

- **Trigger snippet:** A user-defined literal string associated with a positive integer level.
- **Heading:** A detected occurrence of a trigger snippet and its source location.
- **Parent:** The nearest preceding heading with a lower numeric level that remains open.
- **Ancestor:** Any parent, parent's parent, and so forth.
- **Subheading:** A descendant of another heading.

## Initial-release scope

The first release shall:

1. Detect headings in the active text document.
2. Support user-defined literal trigger snippets.
3. Associate each trigger with a positive integer heading level.
4. Generate user-configurable labels using predefined template placeholders.
5. Display headings in document order in an Explorer Tree View.
6. Represent hierarchy through native tree nesting.
7. Allow headings with children to be expanded and collapsed.
8. Navigate to a heading's line when selected.
9. Update automatically as the unsaved document changes.
10. Display the same gutter marker beside every detected heading.

Browser-based VS Code support and Marketplace publication are not required for the initial release.

## Configuration

Proposed configuration:

```json
{
  "tieredHeadings.triggers": [
    {
      "snippet": "@h1",
      "level": 1,
      "labelTemplate": "${after}"
    },
    {
      "snippet": "@h2",
      "level": 2,
      "labelTemplate": "${after}"
    },
    {
      "snippet": "@h3",
      "level": 3,
      "labelTemplate": "Part: ${after}"
    }
  ],
  "tieredHeadings.caseSensitive": true,
  "tieredHeadings.gutter.enabled": true
}
```

Each label template may use:

- `${after}` — text following the matched snippet.
- `${before}` — text preceding the snippet.
- `${line}` — the complete source line.
- `${trigger}` — the matched trigger snippet.
- `${lineNumber}` — the one-based source line number.

The formatted result is trimmed. An empty result becomes `Untitled heading (line N)`.

Invalid definitions must not crash the extension. Valid definitions continue working, while a concise warning identifies the invalid setting.

## Detection rules

- Snippets are matched literally, not as regular expressions.
- Matching is case-sensitive by default.
- A snippet may occur anywhere on a line.
- At most one heading is created per physical line.
- If several snippets match:
  1. The earliest occurrence wins.
  2. At the same position, the longest snippet wins.
  3. A remaining tie is resolved by configuration order.
- Snippets must be non-empty and unique.
- Levels must be integers greater than or equal to 1.
- Matching is language-agnostic and does not require the snippet to be inside a comment.

## Hierarchy rules

Headings are processed in source order using Markdown-style nesting:

1. Level 1 is higher than level 2.
2. A heading's direct parent is the nearest preceding heading with a smaller level.
3. A heading of the same or smaller level closes preceding headings at that level or below.
4. Missing intermediate levels do not create placeholder nodes.
5. A level-3 heading immediately following a level-1 heading becomes its direct child and receives one native tree indentation.
6. A document beginning at level 2 or higher displays that heading at the tree root.

Example source order:

```text
A — level 1
B — level 2
C — level 2
D — level 1
E — level 3
F — level 2
G — level 3
H — level 4
```

Result:

```text
A
├─ B
└─ C
D
├─ E
└─ F
   └─ G
      └─ H
```

Thus:

- A is the direct parent of B and C.
- D is the direct parent of E and F, and an ancestor of G and H.
- F is the direct parent of G and an ancestor of H.
- G is the direct parent of H.

## Explorer view

- The view is named **Tiered Headings** and appears in Explorer.
- It contains headings for the active text editor only, without a file root.
- Headings with children are initially expanded and are collapsible.
- Leaf headings have no collapse control.
- Labels use the configured templates.
- Tooltips include level, line number, and complete source line.
- Clicking a heading places the cursor at its trigger and reveals the line.
- An empty view explains whether no editor, no configured triggers, or no matches are present and provides a configuration action.

## Gutter marker

- Every detected heading in the active editor receives the same theme-compatible gutter icon.
- Markers update alongside the tree and disappear when headings are removed.
- Per-level colors, icons, and trigger highlighting are outside the initial release.
- The marker can be disabled without disabling navigation.

## Non-goals for the initial release

- Workspace-wide indexing or file grouping.
- Regex trigger matching or regex label extraction.
- Persistent bookmarks independent of document text.
- Commands that insert or edit headings.
- Next/previous heading commands.
- Cursor-following selection in the tree.
- Outline, breadcrumb, or Document Symbol integration.
- Custom per-tier decorations.
- Language-aware comment detection.

## Acceptance criteria

- The example hierarchy produces the specified tree.
- Collapsing F hides G and H; collapsing D hides E, F, G, and H.
- Selecting any heading navigates to the correct line and trigger.
- Unsaved edits add, remove, rename, and re-parent headings without manual refresh.
- Switching active editors replaces the pane contents.
- Exactly one gutter marker appears per detected heading line.
- Invalid configuration reports an actionable warning without disabling valid triggers.
- Documents without headings show appropriate welcome content.

## Technical direction

- Implement the extension independently rather than copying code or assets from Inline Bookmarks, which is GPLv3-licensed.
- Use strict TypeScript, the native VS Code Tree View API, and a desktop Node extension bundle.
- Keep scanning, label formatting, and hierarchy construction independent from the VS Code API so they can be unit tested.
- Use full-document line scans after a short debounce. Incremental parsing is deferred until profiling demonstrates a need.
- Treat source text as authoritative; do not persist a heading cache.
- Do not collect telemetry or make network requests.
