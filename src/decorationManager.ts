import * as vscode from "vscode";

import {
  HeadingDecorationLifecycle,
  type HeadingDecorationSpecification,
} from "./decorationLifecycle";
import type { Heading, HeadingStyleMap } from "./model";

function createDecoration(
  extensionUri: vscode.Uri,
  specification: HeadingDecorationSpecification,
): vscode.TextEditorDecorationType {
  if (specification.kind === "gutter") {
    return vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, specification.baseAssetPath),
      gutterIconSize: "contain",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      light: {
        gutterIconPath: vscode.Uri.joinPath(extensionUri, specification.lightAssetPath),
      },
      dark: {
        gutterIconPath: vscode.Uri.joinPath(extensionUri, specification.darkAssetPath),
      },
    });
  }
  return vscode.window.createTextEditorDecorationType({
    ...(specification.fontWeight === undefined
      ? {}
      : { fontWeight: specification.fontWeight }),
    ...(specification.fontStyle === undefined
      ? {}
      : { fontStyle: specification.fontStyle }),
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
}

/** Owns heading decorations and ensures only the active editor is marked. */
export class DecorationManager implements vscode.Disposable {
  private readonly lifecycle: HeadingDecorationLifecycle<
  vscode.TextEditor,
  vscode.TextEditorDecorationType,
  vscode.Range
  >;

  public constructor(extensionUri: vscode.Uri) {
    this.lifecycle = new HeadingDecorationLifecycle({
      createDecoration: (
        specification: HeadingDecorationSpecification,
      ): vscode.TextEditorDecorationType => createDecoration(extensionUri, specification),
      createTriggerRange: (range): vscode.Range => new vscode.Range(
        range.line,
        range.startCharacter,
        range.line,
        range.endCharacter,
      ),
      createLineRange: (editor, heading): vscode.Range => (
        editor.document.lineAt(heading.line).range
      ),
      setDecorations: (editor, decoration, range_rangeId): void => {
        editor.setDecorations(decoration, range_rangeId);
      },
      disposeDecoration: (decoration): void => {
        decoration.dispose();
      },
    });
  }

  public update(
    editor: vscode.TextEditor | undefined,
    heading_headingId: readonly Heading[],
    gutterEnabled: boolean,
    styleByLevel: HeadingStyleMap,
  ): void {
    this.lifecycle.update(editor, heading_headingId, gutterEnabled, styleByLevel);
  }

  public clear(): void {
    this.lifecycle.clear();
  }

  public dispose(): void {
    this.lifecycle.dispose();
  }
}
