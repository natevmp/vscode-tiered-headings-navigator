import * as vscode from "vscode";

import {
  HeadingDecorationLifecycle,
  type HeadingDecorationSpecification,
} from "./decorationLifecycle";
import type { Heading, HeadingStyleMap } from "./model";

interface ManagedDecoration {
  readonly decorationType: vscode.TextEditorDecorationType;
  readonly specification: HeadingDecorationSpecification;
}

export type DecorationApplicationObserver = (
  editor: vscode.TextEditor,
  specification: HeadingDecorationSpecification,
  range_rangeId: readonly vscode.Range[],
) => void;

function createDecoration(
  extensionUri: vscode.Uri,
  specification: HeadingDecorationSpecification,
): ManagedDecoration {
  if (specification.kind === "gutter") {
    return {
      decorationType: vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.joinPath(extensionUri, specification.baseAssetPath),
        gutterIconSize: "contain",
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        light: {
          gutterIconPath: vscode.Uri.joinPath(extensionUri, specification.lightAssetPath),
        },
        dark: {
          gutterIconPath: vscode.Uri.joinPath(extensionUri, specification.darkAssetPath),
        },
      }),
      specification,
    };
  }
  return {
    decorationType: vscode.window.createTextEditorDecorationType({
      ...(specification.fontWeight === undefined
        ? {}
        : { fontWeight: specification.fontWeight }),
      ...(specification.fontStyle === undefined
        ? {}
        : { fontStyle: specification.fontStyle }),
      isWholeLine: specification.isWholeLine,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    }),
    specification,
  };
}

/** Owns heading decorations and ensures only the active editor is marked. */
export class DecorationManager implements vscode.Disposable {
  private readonly lifecycle: HeadingDecorationLifecycle<
  vscode.TextEditor,
  ManagedDecoration,
  vscode.Range
  >;

  public constructor(
    extensionUri: vscode.Uri,
    private readonly onDidApply?: DecorationApplicationObserver,
  ) {
    this.lifecycle = new HeadingDecorationLifecycle({
      createDecoration: (
        specification: HeadingDecorationSpecification,
      ): ManagedDecoration => createDecoration(extensionUri, specification),
      createTriggerRange: (range): vscode.Range => new vscode.Range(
        range.line,
        range.startCharacter,
        range.line,
        range.endCharacter,
      ),
      createLineRange: (editor, heading): vscode.Range => (
        editor.document.lineAt(heading.line).range
      ),
      createTitleRange: (heading, range): vscode.Range => new vscode.Range(
        heading.line,
        range.startCharacter,
        heading.line,
        range.endCharacter,
      ),
      setDecorations: (editor, decoration, range_rangeId): void => {
        editor.setDecorations(decoration.decorationType, range_rangeId);
        this.onDidApply?.(editor, decoration.specification, range_rangeId);
      },
      disposeDecoration: (decoration): void => {
        decoration.decorationType.dispose();
      },
    });
  }

  public update(
    editor: vscode.TextEditor | undefined,
    heading_headingId: readonly Heading[],
    gutterEnabled: boolean,
    styleByLevel: HeadingStyleMap,
    decorateOnlyTitle = false,
  ): void {
    this.lifecycle.update(editor, heading_headingId, gutterEnabled, styleByLevel, decorateOnlyTitle);
  }

  public clear(): void {
    this.lifecycle.clear();
  }

  public dispose(): void {
    this.lifecycle.dispose();
  }
}
