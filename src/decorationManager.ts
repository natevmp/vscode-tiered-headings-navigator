import * as vscode from "vscode";

import { groupHeadingsByTextStyle } from "./headingStyles";
import type { Heading, HeadingStyleMap } from "./model";

/** Owns heading decorations and ensures only the active editor is marked. */
export class DecorationManager implements vscode.Disposable {
  private readonly headingDecoration: vscode.TextEditorDecorationType;

  private readonly boldDecoration: vscode.TextEditorDecorationType;

  private readonly italicDecoration: vscode.TextEditorDecorationType;

  private readonly boldItalicDecoration: vscode.TextEditorDecorationType;

  private decoratedEditor: vscode.TextEditor | undefined;

  public constructor(extensionUri: vscode.Uri) {
    this.headingDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, "resources", "heading.svg"),
      gutterIconSize: "contain",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.boldDecoration = vscode.window.createTextEditorDecorationType({
      fontWeight: "bold",
      isWholeLine: true,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.italicDecoration = vscode.window.createTextEditorDecorationType({
      fontStyle: "italic",
      isWholeLine: true,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.boldItalicDecoration = vscode.window.createTextEditorDecorationType({
      fontWeight: "bold",
      fontStyle: "italic",
      isWholeLine: true,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  public update(
    editor: vscode.TextEditor | undefined,
    heading_headingId: readonly Heading[],
    gutterEnabled: boolean,
    styleByLevel: HeadingStyleMap,
  ): void {
    if (this.decoratedEditor !== undefined && this.decoratedEditor !== editor) {
      this.clearEditor(this.decoratedEditor);
      this.decoratedEditor = undefined;
    }

    if (editor === undefined) {
      return;
    }

    const gutterRange_headingId = gutterEnabled
      ? heading_headingId.map(
        (heading: Heading): vscode.Range => new vscode.Range(
          heading.line,
          heading.startCharacter,
          heading.line,
          heading.endCharacter,
        ),
      )
      : [];
    const styleGroups = groupHeadingsByTextStyle(heading_headingId, styleByLevel);
    const createLineRange = (heading: Heading): vscode.Range => (
      editor.document.lineAt(heading.line).range
    );
    const boldRange_headingId = styleGroups.heading_boldId.map(createLineRange);
    const italicRange_headingId = styleGroups.heading_italicId.map(createLineRange);
    const boldItalicRange_headingId = styleGroups.heading_boldItalicId.map(createLineRange);

    editor.setDecorations(this.headingDecoration, gutterRange_headingId);
    editor.setDecorations(this.boldDecoration, boldRange_headingId);
    editor.setDecorations(this.italicDecoration, italicRange_headingId);
    editor.setDecorations(this.boldItalicDecoration, boldItalicRange_headingId);
    this.decoratedEditor = editor;
  }

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.headingDecoration, []);
    editor.setDecorations(this.boldDecoration, []);
    editor.setDecorations(this.italicDecoration, []);
    editor.setDecorations(this.boldItalicDecoration, []);
  }

  public clear(): void {
    if (this.decoratedEditor !== undefined) {
      this.clearEditor(this.decoratedEditor);
      this.decoratedEditor = undefined;
    }
  }

  public dispose(): void {
    this.clear();
    this.headingDecoration.dispose();
    this.boldDecoration.dispose();
    this.italicDecoration.dispose();
    this.boldItalicDecoration.dispose();
  }
}
