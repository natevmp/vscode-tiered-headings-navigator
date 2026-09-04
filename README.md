# Tiered Headings Navigator

Tiered Headings Navigator is a local-first Visual Studio Code extension that turns user-defined inline snippets into a collapsible heading tree for the active document.

## Features

- Define literal trigger snippets for heading levels 1, 2, 3, and beyond.
- Display headings in a native **Headings** view in Explorer.
- Distinguish levels with quiet, similarly scaled symbols and show `line N` beside each label.
- Expand and collapse nested headings.
- Click a heading to reveal its trigger in the editor.
- Update the tree from unsaved edits.
- Fold each heading's editor section with native VS Code folding controls.
- Show the corresponding level symbol in the editor gutter.
- Style complete heading lines by level, with configurable bold and italic defaults.
- Keep all processing local, with no telemetry or network access.

## Open the navigator

Run **Tiered Headings: Show Headings** from the Command Palette. This opens
Explorer and focuses the **Headings** view, including when VS Code has
previously hidden or moved it.

## Configure heading triggers

Open VS Code settings and add definitions such as:

```json
{
  "tieredHeadings.triggers": [
    {
      "snippet": "@h1",
      "level": 1,
      "labelTemplate": "${after}",
      "labelDelimiters": {
        "start": "----",
        "end": "----"
      }
    },
    {
      "snippet": "@h2",
      "level": 2,
      "labelTemplate": "Section: ${after}",
      "labelDelimiters": {
        "start": "[[",
        "end": "]]"
      }
    },
    {
      "snippet": "@h3",
      "level": 3,
      "labelTemplate": "${after}",
      "labelDelimiters": {
        "start": "<",
        "end": ">>"
      }
    }
  ]
}
```

Then headings can be embedded in any text document:

```text
# @h1 ---- A title ----
// @h2 [[ Installation ]]
// @h3 < Requirements >>
// @h2 [[ Usage ]]
```

The first pane label is exactly `A title`. The complete view displays:

```text
A title
├─ Section: Installation
│  └─ Requirements
└─ Section: Usage
```

Trigger snippets are literal strings and may appear anywhere on a line. They do not need to be inside comments.

### Label delimiters

Optional `labelDelimiters` apply only to text after that trigger. Each trigger can
use different symmetric or asymmetric `start` and `end` strings, as in the mixed
configuration above. After surrounding whitespace is trimmed, both complete
delimiters must match exactly, without overlap. Matching is case-sensitive even
when trigger matching is case-insensitive.

Extraction is all-or-nothing: both delimiters are stripped together and the
resulting title is trimmed. If either delimiter is missing or incomplete while
typing, neither is stripped and the original text after the trigger is used,
without a runtime warning. A malformed delimiter configuration reports a
configuration warning but leaves the trigger active with delimiter extraction
disabled.

### Label templates

Each trigger's `labelTemplate` can contain:

| Placeholder | Value |
| --- | --- |
| `${after}` | Text after the trigger |
| `${before}` | Text before the trigger |
| `${line}` | Complete source line |
| `${trigger}` | Trigger text as it appears in the document |
| `${lineNumber}` | One-based line number |

The default template is `${after}`. Empty labels are shown as `Untitled heading (line N)`.
Delimiter extraction changes only `${after}`; `${line}` and `${before}` retain
their raw source text.

### Explorer presentation

The tree uses quiet, similarly scaled, theme-compatible symbols in the normal
16-pixel icon slot: a filled circle (`circle-filled`) for level 1, an open circle
(`circle-outline`) for level 2, a compact custom plus for level 3, and a native
dash (`dash`) for level 4 and above. The custom plus avoids the larger visual
footprint of VS Code's native `add` icon. The gutter uses the same shape mapping
with custom light/dark SVGs on a consistent 16-pixel grid. Each row shows only
`line N` as its description. Its accessibility label also states the heading
label, level, and line number.

### Editor folding

Native editor folding is enabled by default for detected headings in every open
configured text document, including documents shown side by side. A heading line
stays visible when folded. Its hidden section continues through the line before
the next heading of the same or a lower numeric level, or through the end of the
document. Deeper headings remain inside their ancestor's section and provide
their own nested folds when they contain at least one following line.

The extension supplies ordinary structural folding ranges. It does not insert
region markers, collapse sections automatically, persist fold state, or classify
headings for **Fold All Regions**. Set `tieredHeadings.folding.enabled` to `false`
to stop supplying custom ranges for a resource. VS Code can retain an
already-collapsed range as a recovered fold after the setting is disabled;
manually unfold it to reveal the content. VS Code controls whether the recovered
fold control remains afterward.

VS Code merges these ranges with folding supplied by the document's language.
If another provider starts a fold on the same line, that provider can take
precedence. Folding also depends on VS Code's `editor.folding`,
`editor.showFoldingControls`, and `editor.foldingStrategy` settings; use the
default `auto` strategy to allow provider-based ranges.

### Other settings

```json
{
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

Each listed level can use `normal`, `bold`, `italic`, or `boldItalic`. Unlisted
levels retain the editor's normal font style. Set
`tieredHeadings.editor.levelStyles` to an empty array to disable heading text
styling. VS Code's supported decoration API does not provide per-line font-size
changes.

## Development

Requirements:

- Node.js 22 or newer
- VS Code 1.75 or newer (desktop)

Install and build:

```sh
npm install
npm run compile
```

Press **F5** in VS Code to open an Extension Development Host with the sample workspace.
Open `sample.txt`, `hierarchy-demo.txt`, or `folding-demo.txt`, then expand
**Headings** in Explorer.

Useful commands:

```sh
npm run check
npm run verify
npm run vsix
```

`npm run verify` runs unit checks plus Extension Host tests against the current
and minimum supported VS Code releases. Integration scripts always rebuild the
extension first, and VSIX packaging is gated by the same verification suite.

See `PRODUCT_SPEC.md` for the product rules and acceptance criteria.
See `TESTING.md` for a short manual test checklist.

## Current scope

The navigator follows only the active text document, while native folding is
available in every open configured text document. Workspace-wide indexing,
browser-based VS Code, regex triggers, and Marketplace publication are
deliberately deferred.

## Development disclosure

This codebase was generated using large-language-model (LLM) coding tools under
the maintainer's direction. The maintainer defined the requirements, made the
product decisions, and ran the documented automated tests. The code has not
received a complete independent human audit for TypeScript correctness,
security, provenance, or license compliance. Review and test it before relying
on it, and report problems through the repository's issue tracker.

The extension was inspired by tintinweb's
[Inline Bookmarks](https://github.com/tintinweb/vscode-inline-bookmarks)
extension. It was implemented independently, and Inline Bookmarks was used only
as a functional reference.

## License

Tiered Headings Navigator is available under the [MIT License](LICENSE).
