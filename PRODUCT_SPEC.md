# Tiered Headings Navigator — Product Specification

**Status:** Draft v0.4
**Product type:** Visual Studio Code desktop extension

## Summary

Tiered Headings Navigator detects user-defined heading snippets embedded in text documents, displays the resulting headings as a collapsible hierarchy in a new Explorer view, and supplies matching native editor folding ranges.

The view follows the active text editor. Selecting a heading navigates to its source line. Heading levels behave like Markdown heading levels, with smaller integers representing higher-level headings.

## Terminology

- **Trigger snippet:** A user-defined literal string associated with a positive integer level.
- **Label delimiters:** Optional exact start and end strings used to extract `${after}` for one trigger.
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
10. Display a gutter marker matching each detected heading's level category.
11. Apply configurable bold and italic whole-line styles by heading level.
12. Support optional literal, per-trigger label delimiters.
13. Present heading levels with quiet, similarly scaled shape icons.
14. Provide native editor folding sections derived from heading hierarchy.

Browser-based VS Code support and Marketplace publication are not required for the initial release.

## Configuration

Proposed configuration:

```json
{
  "tieredHeadings.triggers": [
    {
      "snippet": "@h1",
      "level": 1,
      "labelTemplate": "${after}",
      "labelDelimiters": { "start": "----", "end": "----" }
    },
    {
      "snippet": "@h2",
      "level": 2,
      "labelTemplate": "${after}",
      "labelDelimiters": { "start": "[[", "end": "]]" }
    },
    {
      "snippet": "@h3",
      "level": 3,
      "labelTemplate": "Part: ${after}",
      "labelDelimiters": { "start": "<", "end": ">>" }
    }
  ],
  "tieredHeadings.caseSensitive": true,
  "tieredHeadings.gutter.enabled": true,
  "tieredHeadings.folding.enabled": true,
  "tieredHeadings.editor.levelStyles": [
    { "level": 1, "style": "bold" },
    { "level": 2, "style": "boldItalic" },
    { "level": 3, "style": "italic" }
  ]
}
```

Each label template may use:

- `${after}` — text following the matched snippet.
- `${before}` — text preceding the snippet.
- `${line}` — the complete source line.
- `${trigger}` — the matched trigger snippet.
- `${lineNumber}` — the one-based source line number.

The formatted result is trimmed. An empty result becomes `Untitled heading (line N)`.

When a trigger has `labelDelimiters`, only its text after the matched trigger is
eligible for extraction. Surrounding whitespace is trimmed first. Both non-empty,
single-line delimiters must match as complete, exact, case-sensitive strings and
must not overlap. They are then removed atomically and the extracted title is
trimmed before it is supplied as `${after}`. If either delimiter does not match,
the original after text is supplied without partial stripping or a runtime
warning. `${before}` and `${line}` remain raw. Delimiter case sensitivity is
independent of trigger case sensitivity, and each trigger may use different,
including asymmetric, delimiters.

Invalid definitions must not crash the extension. Valid definitions continue working, while a concise warning identifies the invalid setting. Malformed `labelDelimiters` reports actionable configuration issues but does not discard an otherwise valid trigger; that trigger instead operates without delimiter extraction.

Level styles accept `normal`, `bold`, `italic`, or `boldItalic`. Unlisted levels
remain unchanged, and an empty style array disables editor text styling.

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

## Editor folding

- Native editor folding is enabled by default and can be disabled per resource
  with `tieredHeadings.folding.enabled`.
- Disabling folding stops future provider contribution. VS Code may preserve an
  already-collapsed range as recovered editor state; unfolding reveals its
  content, but the stable API cannot selectively remove that range without
  risking unrelated folds.
- Folding ranges are available for every open configured text document rather
  than only the editor currently followed by the Explorer view.
- The heading line is the visible start of its range.
- A heading's range ends on the line before the next heading with the same or a
  lower numeric level, or on the document's final line when no such heading
  follows.
- Deeper headings do not close ancestor ranges and may provide nested folds.
- A range is omitted when the heading has no following physical line to hide.
- Heading folds are ordinary structural ranges, not marker regions; they work
  with normal folding commands but are not specifically targeted by **Fold All
  Regions**.
- The extension does not insert markers, modify source text, automatically
  collapse sections, or persist collapsed state.
- VS Code owns range merging and collapsed-state reconciliation. A language
  provider that begins a fold on the same line can take precedence, and an
  indentation-only folding strategy can suppress provider-based ranges.

## Explorer view

- The view is named **Headings** and appears in Explorer.
- It contains headings for the active text editor only, without a file root.
- Headings with children are initially expanded and are collapsible.
- Leaf headings have no collapse control.
- Labels use the configured templates.
- Tooltips include level, line number, and complete source line.
- Similarly scaled, theme-compatible icons distinguish levels in the normal 16-pixel slot: native `circle-filled` for level 1, native `circle-outline` for level 2, a compact custom plus for level 3, and native `dash` for level 4 and above.
- Each row description is `line N`; an accessibility label explicitly includes the heading label, level, and line number.
- Clicking a heading places the cursor at its trigger and reveals the line.
- An empty view explains whether no editor, no configured triggers, or no matches are present and provides a configuration action.
- A **Tiered Headings: Show Headings** command opens Explorer and focuses the view.

## Gutter marker

- Every detected heading in the active editor receives the shape matching the pane mapping: filled circle for level 1, open circle for level 2, plus for level 3, and dash for level 4 and above.
- Custom gutter SVGs use consistent 16-by-16 grids, approximately 8-by-8 visible bounds, neutral base fallbacks, and light/dark variants.
- Markers update alongside the tree and disappear when headings are removed.
- Per-level gutter colors and trigger-only highlighting are outside the initial release; marker shapes vary by level but use common neutral colors.
- The marker can be disabled without disabling navigation.

## Editor heading styles

- Font weight and italics apply to the complete physical heading line.
- Defaults are bold for level 1, bold italic for level 2, italic for level 3, and normal for unlisted levels.
- Styles are resource-scoped and update with the heading model.
- Styling can be disabled independently from gutter markers and navigation.
- Per-line font sizes are unsupported by the stable VS Code decoration API.

## Non-goals for the initial release

- Workspace-wide indexing or file grouping.
- Regex trigger matching or regex label extraction.
- Persistent bookmarks independent of document text.
- Commands that insert or edit headings.
- Next/previous heading commands.
- Cursor-following selection in the tree.
- Automatic folding or extension-managed persistence of collapsed state.
- Outline, breadcrumb, or Document Symbol integration.
- Per-tier font sizes or arbitrary CSS.
- Language-aware comment detection.

## Acceptance criteria

- The example hierarchy produces the specified tree.
- Collapsing F hides G and H; collapsing D hides E, F, G, and H.
- Selecting any heading navigates to the correct line and trigger.
- Unsaved edits add, remove, rename, and re-parent headings without manual refresh.
- Switching active editors replaces the pane contents.
- Exactly one correctly shaped gutter marker appears per detected heading line.
- Default whole-line styles match the configured level 1–3 behavior, while higher levels remain normal.
- The Show Headings command reveals and focuses the Explorer view.
- Invalid configuration reports an actionable warning without disabling valid triggers.
- Exact, non-overlapping delimiter pairs extract `${after}` atomically; incomplete pairs preserve the original after text without runtime warnings.
- Documents without headings show appropriate welcome content.
- Folding a heading keeps that heading visible and hides content through the
  line before the next same-level or ancestor-level heading.
- Nested headings produce nested, non-crossing ranges, and headings without a
  following line do not produce useless ranges.
- Folding updates from unsaved edits and is available in multiple open
  configured documents.
- Disabling `tieredHeadings.folding.enabled` stops custom range contribution
  without disabling navigation, styling, or gutter markers; already-collapsed
  recovered editor state follows VS Code's documented platform behavior.

## Technical direction

- Implement the extension independently rather than copying code or assets from Inline Bookmarks, which is GPLv3-licensed.
- Use strict TypeScript, the native VS Code Tree View API, and a desktop Node extension bundle.
- Require VS Code 1.75 or newer so a folding provider can abstain without
  suppressing the editor's indentation-based fallback ranges.
- Keep scanning, label formatting, and hierarchy construction independent from the VS Code API so they can be unit tested.
- Keep folding-boundary calculation independent from the VS Code API and reuse
  the validated trigger scanner as its source of headings.
- Use full-document line scans after a short debounce. Incremental parsing is deferred until profiling demonstrates a need.
- Treat source text as authoritative; do not persist a heading cache.
- Do not collect telemetry or make network requests.
