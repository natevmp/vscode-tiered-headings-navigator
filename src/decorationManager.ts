import * as vscode from "vscode";

import type { Heading } from "./model";

/** Owns the common gutter decoration and ensures only the active editor is marked. */
export class DecorationManager implements vscode.Disposable {
  private readonly headingDecoration: vscode.TextEditorDecorationType;

  private decoratedEditor: vscode.TextEditor | undefined;

  public constructor(extensionUri: vscode.Uri) {
    this.headingDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, "resources", "heading.svg"),
      gutterIconSize: "contain",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  public update(
    editor: vscode.TextEditor | undefined,
    heading_headingId: readonly Heading[],
    enabled: boolean,
  ): void {
    if (this.decoratedEditor !== undefined && this.decoratedEditor !== editor) {
      this.decoratedEditor.setDecorations(this.headingDecoration, []);
      this.decoratedEditor = undefined;
    }

    if (editor === undefined) {
      return;
    }

    const range_headingId = enabled
      ? heading_headingId.map(
        (heading: Heading): vscode.Range => new vscode.Range(
          heading.line,
          heading.startCharacter,
          heading.line,
          heading.endCharacter,
        ),
      )
      : [];

    editor.setDecorations(this.headingDecoration, range_headingId);
    this.decoratedEditor = editor;
  }

  public clear(): void {
    if (this.decoratedEditor !== undefined) {
      this.decoratedEditor.setDecorations(this.headingDecoration, []);
      this.decoratedEditor = undefined;
    }
  }

  public dispose(): void {
    this.clear();
    this.headingDecoration.dispose();
  }
}
