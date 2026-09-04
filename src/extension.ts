import * as vscode from "vscode";

import { DecorationManager } from "./decorationManager";
import { HeadingController, type ActiveHeadingSnapshot } from "./headingController";
import { HeadingFoldingProvider } from "./headingFoldingProvider";
import { HeadingTreeProvider } from "./headingTreeProvider";
import type { HeadingNavigationTarget } from "./model";
import { affectsHeadingSettings } from "./settings";

const viewId = "tieredHeadings.explorer";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new HeadingTreeProvider(context.extensionUri);
  const treeView = vscode.window.createTreeView(viewId, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  const decorationManager = new DecorationManager(context.extensionUri);
  const outputChannel = vscode.window.createOutputChannel("Tiered Headings");
  const controller = new HeadingController(
    provider,
    treeView,
    decorationManager,
    outputChannel,
  );
  const foldingProvider = new HeadingFoldingProvider();
  const foldingRegistration = vscode.languages.registerFoldingRangeProvider(
    "*",
    foldingProvider,
  );

  const disposable_disposableId: vscode.Disposable[] = [
    provider,
    treeView,
    decorationManager,
    outputChannel,
    controller,
    foldingProvider,
    foldingRegistration,
    vscode.commands.registerCommand(
      "tieredHeadings.openSettings",
      async (): Promise<void> => {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "tieredHeadings.triggers",
        );
      },
    ),
    vscode.commands.registerCommand(
      "tieredHeadings.refresh",
      (): void => {
        controller.refresh();
        foldingProvider.refresh();
      },
    ),
    vscode.commands.registerCommand(
      "tieredHeadings.showHeadings",
      async (): Promise<void> => {
        await vscode.commands.executeCommand("workbench.view.explorer");
        await vscode.commands.executeCommand(`${viewId}.focus`);
      },
    ),
    vscode.commands.registerCommand(
      "tieredHeadings.navigate",
      (target: HeadingNavigationTarget): void => {
        controller.navigateToHeading(target);
      },
    ),
    vscode.commands.registerCommand(
      "_tieredHeadings.getActiveSnapshot",
      (): ActiveHeadingSnapshot | undefined => controller.getActiveSnapshot(),
    ),
    vscode.commands.registerCommand(
      "_tieredHeadings.getTreeNavigationTargets",
      (): readonly unknown[] => provider.getNavigationTargetsForTesting(),
    ),
    vscode.commands.registerCommand(
      "_tieredHeadings.isViewVisible",
      (): boolean => treeView.visible,
    ),
    vscode.commands.registerCommand(
      "_tieredHeadings.getTreeItems",
      (): readonly vscode.TreeItem[] => provider.getTreeItemsForTesting(),
    ),
    vscode.commands.registerCommand(
      "_tieredHeadings.getFoldingRanges",
      (documentUri: vscode.Uri): vscode.FoldingRange[] | undefined => {
        const document = vscode.workspace.textDocuments.find(
          (candidate: vscode.TextDocument): boolean => (
            candidate.uri.toString() === documentUri.toString()
          ),
        );
        if (document === undefined) {
          return undefined;
        }
        const cancellationSource = new vscode.CancellationTokenSource();
        try {
          return foldingProvider.provideFoldingRanges(
            document,
            {},
            cancellationSource.token,
          );
        } finally {
          cancellationSource.dispose();
        }
      },
    ),
    vscode.window.onDidChangeActiveTextEditor((): void => {
      controller.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument(
      (event: vscode.TextDocumentChangeEvent): void => {
        controller.scheduleRefresh(event);
      },
    ),
    vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument): void => {
      controller.forgetDocument(document);
    }),
    vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent): void => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!affectsHeadingSettings(event)) {
          return;
        }
        foldingProvider.refresh();
        controller.resetConfigurationIssueNotifications();
        if (
          activeEditor !== undefined
          && affectsHeadingSettings(event, activeEditor.document.uri)
        ) {
          controller.refresh();
        }
      },
    ),
  ];

  context.subscriptions.push(...disposable_disposableId);
  controller.refresh();
}

export function deactivate(): void {
  // VS Code disposes all resources registered in the extension context.
}
