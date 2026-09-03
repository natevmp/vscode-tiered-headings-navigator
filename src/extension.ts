import * as vscode from "vscode";

import { DecorationManager } from "./decorationManager";
import { HeadingController, type ActiveHeadingSnapshot } from "./headingController";
import { HeadingTreeProvider } from "./headingTreeProvider";
import type { HeadingNavigationTarget } from "./model";
import { affectsHeadingSettings } from "./settings";

const viewId = "tieredHeadings.explorer";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new HeadingTreeProvider();
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

  const disposable_disposableId: vscode.Disposable[] = [
    provider,
    treeView,
    decorationManager,
    outputChannel,
    controller,
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
