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
12. Add, rename, or remove a heading without saving and confirm the tree updates shortly afterward.
13. Collapse **Introduction** and confirm its descendants disappear.
14. Open `hierarchy-demo.txt` and compare the tree with the expected hierarchy below.
15. Now confirm all four gutter and pane shapes at a similar visual scale: filled circle/`circle-filled` for level 1, open circle/`circle-outline` for level 2, compact plus for level 3, and dash/`dash` for level 4 and higher.
16. Switch between light and dark themes. Confirm all four gutter shapes remain similarly scaled, subtle, and visible, and the native pane symbols remain theme-compatible.
17. Open `folding-demo.txt` and hover over the editor gutter. Confirm native fold
    controls appear for headings that contain at least one following line.
18. Fold **Alpha** and confirm its heading remains visible while everything
    through the line before **Epsilon** is hidden. Unfold it and confirm **Beta**,
    **Gamma**, and **Delta** provide correctly nested or adjacent folds.
19. Edit a heading level without saving and confirm the fold boundaries update.
20. Open `sample.txt` beside `folding-demo.txt` and confirm both editors retain
    heading-derived folding ranges regardless of which editor is active.
21. Run normal **Fold All** and confirm heading folds participate. Confirm **Fold
    All Regions** does not specifically treat these headings as marker regions.
22. Open `indented-no-headings.txt` and confirm its ordinary indentation-based
    folds remain available even though no configured heading occurs in it.

Expected hierarchy for `hierarchy-demo.txt`:

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

`E` is level 3 but is a direct child of `D` because no level-2 heading occurs between them.

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
