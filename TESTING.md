# Testing Tiered Headings Navigator

## Automated checks

```sh
npm run check
npm run verify
npm run package
```

`npm run verify` runs Extension Host tests against the current VS Code release
and the declared minimum, VS Code 1.74. The runners download isolated copies on
their first use. Packaging also runs the complete verification suite.

## Manual Extension Development Host test

1. Run `npm install` and `npm run compile`.
2. Press **F5** in VS Code using **Run Tiered Headings Navigator**.
3. In the Extension Development Host, open `sample.txt`.
4. Run **Tiered Headings: Show Headings** and confirm Explorer focuses the **Headings** view.
5. Confirm the tree contains **Introduction → Installation → Details**.
6. Confirm every heading line has an `H` marker in the editor gutter.
7. Confirm level 1 is bold, level 2 is bold italic, and level 3 is italic across each complete heading line.
8. Confirm the tree rows have H1, H2, and H3 level icons in both light and dark themes.
9. Click **Details** and confirm the cursor moves to its `@h3` trigger.
10. Add, rename, or remove a heading without saving and confirm the tree updates shortly afterward.
11. Collapse **Introduction** and confirm its descendants disappear.
12. Open `hierarchy-demo.txt` and compare the tree with the expected hierarchy below.

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

Set `tieredHeadings.editor.levelStyles` to `[]` and confirm editor text styling
disappears while gutter markers and navigation continue working. Then configure
an arbitrary higher level and confirm its selected style applies immediately.
