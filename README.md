# Tiered Headings Navigator

Tiered Headings Navigator is a local-first Visual Studio Code extension that turns user-defined inline snippets into a collapsible heading tree for the active document.

## Features

- Define literal trigger snippets for heading levels 1, 2, 3, and beyond.
- Optionally transform navigation labels with per-trigger regular expressions.
- Display headings in a native **Headings** view in Explorer.
- Distinguish levels with quiet, similarly scaled symbols and show `line N` beside each label.
- Expand and collapse nested headings.
- Click a heading to reveal its trigger in the editor.
- Follow the primary editor cursor by selecting its current heading in the tree.
- Update the tree from unsaved edits.
- Fold each heading's editor section with native VS Code folding controls.
- Optionally mirror parent-heading collapse and expand actions from the tree to the editor.
- Show the corresponding level symbol in the editor gutter.
- Style complete heading lines by level, with configurable bold and italic defaults.
- Keep all processing local, with no telemetry or network access.

## Open the navigator

Run **Tiered Headings: Show Headings** from the Command Palette. This opens
Explorer and focuses the **Headings** view, including when VS Code has
previously hidden or moved it.

### Cursor following

While the **Headings** view is visible, its native row selection follows the
section containing the primary editor cursor. The current section is the last
heading on or before the cursor line. Revealing that row expands its tree
ancestors when needed but does not move keyboard focus out of the editor.

The extension does not open a hidden view just to follow the cursor; the
selection catches up when the view next becomes visible. Before the document's
first heading there is no current section. The stable Tree View API cannot clear
an existing native selection, so the previously selected row may remain visible
in that preamble.

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

### Regex label replacements

Optional `labelRegex` applies one case-sensitive Unicode JavaScript regular-
expression replacement to the raw text after a matched trigger, before
`labelTemplate` is evaluated. For example:

```json
{
  "snippet": "@h1",
  "level": 1,
  "labelTemplate": "${after}",
  "labelRegex": {
    "pattern": "\\s+-+\\s*$",
    "replacement": ""
  }
}
```

With this definition, `## @h1 This is the title -----------------` appears as
**This is the title**. The `-+` quantifier accepts any positive number of
trailing dashes. Backslashes are doubled because the expression is stored in
JSON.

Replacement text uses JavaScript replacement syntax, including `$1` and
`$<name>` capture references. If the expression does not match, the original
text after the trigger is retained, which keeps labels usable while a line is
being typed. Invalid expressions produce a configuration warning but leave the
literal trigger active without the transformation.

`labelRegex` and `labelDelimiters` cannot be combined on one trigger. If both
are present, the existing delimiter behavior is retained and `labelRegex` is
ignored. Regex label replacements are disabled in VS Code Restricted Mode and
activate after the workspace is trusted. Trigger detection itself remains
literal.

Label expressions execute synchronously in trusted workspaces. Prefer anchored,
specific patterns and avoid ambiguous nested quantifiers, which can make a
JavaScript regular expression take a long time to evaluate.

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
Delimiter extraction and regex replacement change only `${after}`; `${line}`
and `${before}` retain their raw source text.

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

Set `tieredHeadings.folding.syncFromNavigator` to `true` to make collapsing or
expanding a parent heading in the **Headings** view fold or unfold that heading's
editor section. This option is off by default and is deliberately one-way:
folding in the editor does not change the tree. Leaf rows have no action, and
the extension does not reconcile an initial state or persist synchronized fold
state. Synchronization is skipped when custom heading folding or
`editor.folding` is disabled, and when `editor.foldingStrategy` is
`indentation`. Ordinary editor gutter and keybinding folds remain independent.

### Other settings

```json
{
  "tieredHeadings.caseSensitive": true,
  "tieredHeadings.gutter.enabled": true,
  "tieredHeadings.folding.enabled": true,
  "tieredHeadings.folding.syncFromNavigator": false,
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
browser-based VS Code, regex trigger matching, and Marketplace publication are
deliberately deferred. Label-only regex replacements do not make trigger
matching regex-based.

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
