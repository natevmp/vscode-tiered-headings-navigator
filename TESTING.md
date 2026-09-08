# Testing Tiered Headings Navigator

## Automated checks

```sh
npm run check
npm run verify
npm run package
```

`npm run verify` runs Extension Host tests against the current VS Code release
and the declared minimum, VS Code 1.75. The runners download isolated copies on
their first use. Packaging also runs the complete verification suite.

## Manual Extension Development Host test

1. Run `npm install` and `npm run compile`.
2. Press **F5** in VS Code using **Run Tiered Headings Navigator**.
3. In the Extension Development Host, open `sample.txt`.
4. Run **Tiered Headings: Show Headings** and confirm Explorer focuses the **Headings** view.
5. Confirm the tree contains **Introduction → Installation → Details**.
6. Confirm the sample's gutter markers are a filled circle for level 1, open circle for level 2, and plus for level 3.
7. Confirm level 1 is bold, level 2 is bold italic, and level 3 is italic across each complete heading line.
8. Confirm the sample's pane symbols are `circle-filled` for level 1, `circle-outline` for level 2, and a compact custom plus for level 3.
9. Confirm each row description is only `line N`, with no `Lx` text.
10. Where practical, inspect the tree with a screen reader and confirm each row announces its heading label, level, and line number.
11. Click **Details** and confirm the cursor moves to its `@h3` trigger.
12. Click in the body beneath **Installation** and then beneath **Details**.
    Confirm the matching tree row is selected, required ancestors expand, and
    keyboard focus remains in the editor.
13. Give the editor multiple cursors in different sections and confirm the tree
    follows the primary selection's active cursor.
14. Hide Explorer, move the cursor to another heading section, and confirm the
    sidebar stays hidden. Show **Headings** and confirm its selection catches up.
15. Add, rename, or remove a heading without saving and confirm the tree updates shortly afterward.
16. Collapse **Introduction** and confirm its descendants disappear.
17. Open `hierarchy-demo.txt` and compare the tree with the expected hierarchy below.
18. Now confirm all four gutter and pane shapes at a similar visual scale: filled circle/`circle-filled` for level 1, open circle/`circle-outline` for level 2, compact plus for level 3, and dash/`dash` for level 4 and higher.
19. Switch between light and dark themes. Confirm all four gutter shapes remain similarly scaled, subtle, and visible, and the native pane symbols remain theme-compatible.
20. Open `folding-demo.txt` and hover over the editor gutter. Confirm native fold
    controls appear for headings that contain at least one following line.
21. Fold **Alpha** and confirm its heading remains visible while everything
    through the line before **Epsilon** is hidden. Unfold it and confirm **Beta**,
    **Gamma**, and **Delta** provide correctly nested or adjacent folds.
22. Edit a heading level without saving and confirm the fold boundaries update.
23. Open `sample.txt` beside `folding-demo.txt` and confirm both editors retain
    heading-derived folding ranges regardless of which editor is active.
24. Run normal **Fold All** and confirm heading folds participate. Confirm **Fold
    All Regions** does not specifically treat these headings as marker regions.
25. Open `indented-no-headings.txt` and confirm its ordinary indentation-based
    folds remain available even though no configured heading occurs in it.
26. Enable `tieredHeadings.folding.syncFromNavigator`, return to
    `folding-demo.txt`, and collapse and expand **Alpha** with its tree twisty.
    Confirm the matching editor section folds and unfolds while the tree keeps
    keyboard focus.
27. Collapse and expand **Beta** repeatedly and confirm the commands remain
    idempotent and do not fold **Alpha**. Confirm leaf rows have no twisty.
28. Fold or unfold a section from the editor gutter and confirm that action does
    not change tree expansion. Disable navigator synchronization and confirm tree
    collapse and expand actions no longer alter editor folding.

Expected hierarchy for `hierarchy-demo.txt`:

```text
A
└─ B
C
└─ D
   └─ E
      └─ F
```

The demo includes all four marker styles and shows a simple four-level branch
under `C`.

## Title-only decoration test

1. Open `regex-label.txt` with the configured trailing-separator regex and leave
   `tieredHeadings.editor.decorateOnlyTitle` at its default `false`. Confirm the
   full heading line is bold, including `## @h1` and the separator.
2. Enable `tieredHeadings.editor.decorateOnlyTitle`. Confirm only **This is the
   title** becomes bold, without a reload or manual refresh. The gutter marker,
   pane label, navigation target, and folding must not change.
3. Try `@h2 [[ Installation ]]` with matching `labelDelimiters`. Only the title
   should receive that level's style, not the trigger or delimiters. Remove a
   delimiter and confirm styling follows the same raw fallback as the pane.
4. Try a regex that reorders two captures using `$2 / $1`. Only the two captured
   source fragments should be styled; the generated slash has no editor span.
   Use repeated identical words to confirm the correct occurrences are styled.
5. Add a generated template prefix such as `Section ${lineNumber}: ${after}`.
   Only the source-backed part should be styled. A constant-only or empty label
   should leave source text unstyled, while its gutter marker remains visible.
6. Explicitly include `${trigger}`, `${before}`, or `${line}` and confirm those
   source fragments are styled as well. `${line}` can include the full line.
7. Edit the title without saving, including text with emoji, then switch editors.
   Confirm ranges track the new title and no stale decorations remain in the old
   editor. Repeat with bold, italic, bold italic, and disabled level styles.
8. Disable the toggle and confirm whole-line styling is restored immediately.
   Check both light and dark themes and leave the toggle at `false` afterward.

## Configuration test

Use the gear button in the **Headings** view to open settings. Try changing a label template:

```json
{
  "snippet": "@h2",
  "level": 2,
  "labelTemplate": "Section ${lineNumber}: ${after}"
}
```

The pane should update immediately. An unsupported placeholder such as `${title}` should produce one warning while other valid triggers continue working.

Also configure mixed delimiters:

```json
[
  {
    "snippet": "@h1",
    "level": 1,
    "labelDelimiters": { "start": "----", "end": "----" }
  },
  {
    "snippet": "@h2",
    "level": 2,
    "labelDelimiters": { "start": "[[", "end": ">>" }
  }
]
```

Confirm `# @h1 ---- A title ----` appears as **A title**, while
`# @h2 [[ Asymmetric title >>` appears as **Asymmetric title**. Remove or
partially type either closing delimiter and confirm neither delimiter is
partially stripped, the original after text remains visible, and no runtime
warning appears. Restore it and confirm extraction resumes. Try mismatched
delimiter case and overlapping delimiters, and confirm extraction occurs only
for complete, exact, case-sensitive, non-overlapping pairs.

Then configure a regex label replacement:

```json
{
  "snippet": "@h1",
  "level": 1,
  "labelRegex": {
    "pattern": "\\s+-+\\s*$",
    "replacement": ""
  }
}
```

Confirm `## @h1 This is the title -----------------` appears as **This is the
title**. Change the number of dashes and confirm the label remains unchanged.
Temporarily remove the dashes and confirm the raw title remains visible. Also
test a capture replacement, an invalid pattern, and a trigger containing both
`labelRegex` and `labelDelimiters`; the invalid or conflicting regex must not
disable literal heading detection, and delimiters must win a conflict.

Open the fixture workspace in Restricted Mode and confirm the regex is not
executed, the heading remains present with its raw after text, and one
configuration notice explains the restriction. Trust the workspace and confirm
the transformed label appears without restarting the Extension Host.

Set `tieredHeadings.editor.levelStyles` to `[]` and confirm editor text styling
disappears while gutter markers and navigation continue working. Disable
`tieredHeadings.gutter.enabled` and confirm all four gutter marker types disappear
while configured text styling remains. Then configure an arbitrary higher level
and confirm its dash marker and selected text style apply immediately.

Set `tieredHeadings.folding.enabled` to `false` for the workspace and confirm the
extension stops supplying new custom ranges without affecting the pane, gutter
markers, styles, or navigation. An already-collapsed range may remain as VS
Code-recovered editor state; manually unfolding it reveals the content, although
the recovered fold control may remain. Restore the setting to `true`. If controls
do not appear, confirm VS Code's `editor.folding` is enabled,
`editor.showFoldingControls` is not `never`, and `editor.foldingStrategy` is
`auto`. Also sample a language with its own folding provider and confirm any
same-line precedence is acceptable.

With `tieredHeadings.folding.syncFromNavigator` enabled, separately disable
`tieredHeadings.folding.enabled` and `editor.folding`, then set a
language-specific `editor.foldingStrategy` to `indentation`. In each case,
confirm tree collapse and expand actions leave editor folding unchanged. Restore
the default `auto` strategy afterward.
