# Tiered Headings Navigator

Tiered Headings Navigator is a local-first Visual Studio Code extension that turns user-defined inline snippets into a collapsible heading tree for the active document.

## Features

- Define literal trigger snippets for heading levels 1, 2, 3, and beyond.
- Display headings in a native **Headings** view in Explorer.
- Expand and collapse nested headings.
- Click a heading to reveal its trigger in the editor.
- Update the tree from unsaved edits.
- Show a common heading marker in the editor gutter.
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
      "labelTemplate": "${after}"
    },
    {
      "snippet": "@h2",
      "level": 2,
      "labelTemplate": "Section: ${after}"
    },
    {
      "snippet": "@h3",
      "level": 3,
      "labelTemplate": "${after}"
    }
  ]
}
```

Then headings can be embedded in any text document:

```text
// @h1 Introduction
// @h2 Installation
// @h3 Requirements
// @h2 Usage
```

The view displays:

```text
Introduction
├─ Section: Installation
│  └─ Requirements
└─ Section: Usage
```

Trigger snippets are literal strings and may appear anywhere on a line. They do not need to be inside comments.

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

### Other settings

```json
{
  "tieredHeadings.caseSensitive": true,
  "tieredHeadings.gutter.enabled": true,
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
- VS Code desktop

Install and build:

```sh
npm install
npm run compile
```

Press **F5** in VS Code to open an Extension Development Host with the sample workspace.
Open `sample.txt` or `hierarchy-demo.txt`, then expand **Headings** in Explorer.

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

The initial release follows only the active text document. Workspace-wide indexing, browser-based VS Code, regex triggers, and Marketplace publication are deliberately deferred.

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
as a functional reference. To the maintainer's knowledge, no code or assets
were copied from it.

## License

Tiered Headings Navigator is available under the [MIT License](LICENSE).
