import * as vscode from "vscode";

import { calculateHeadingFoldingRanges } from "./foldingRanges";
import { scanDocument } from "./scanner";
import { readHeadingSettings } from "./settings";

/** Supplies native editor folding ranges for headings in any text document. */
export class HeadingFoldingProvider implements vscode.FoldingRangeProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  public readonly onDidChangeFoldingRanges = this.changeEmitter.event;

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    token: vscode.CancellationToken,
  ): vscode.FoldingRange[] | undefined {
    if (token.isCancellationRequested) {
      return undefined;
    }

    const settings = readHeadingSettings(document);
    if (!settings.foldingEnabled || settings.trigger_triggerId.length === 0) {
      return undefined;
    }

    const heading_headingId = scanDocument(
      document.getText(),
      document.uri.toString(),
      settings.trigger_triggerId,
      settings.caseSensitive,
    );
    if (token.isCancellationRequested) {
      return undefined;
    }

    const range_headingId = calculateHeadingFoldingRanges(
      heading_headingId,
      document.lineCount,
    );
    if (range_headingId.length === 0) {
      return undefined;
    }

    return range_headingId.map(
      (range): vscode.FoldingRange => new vscode.FoldingRange(
        range.startLine,
        range.endLine,
      ),
    );
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}
