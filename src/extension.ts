import * as vscode from "vscode";

import {
  DecorationManager,
  type DecorationApplicationObserver,
} from "./decorationManager";
import type {
  HeadingDecorationId,
  HeadingDecorationSpecification,
} from "./decorationLifecycle";
import { HeadingController, type ActiveHeadingSnapshot } from "./headingController";
import { HeadingFoldingProvider } from "./headingFoldingProvider";
import { HeadingTreeProvider } from "./headingTreeProvider";
import type { HeadingNavigationTarget, HeadingNode } from "./model";
import { affectsHeadingSettings } from "./settings";

const viewId = "tieredHeadings.explorer";

interface SerializedDecorationRange {
  readonly startLine: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
}

interface DecorationApplicationSnapshot {
  readonly documentIdentity: string;
  readonly specification: HeadingDecorationSpecification;
  readonly range_rangeId: readonly SerializedDecorationRange[];
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new HeadingTreeProvider(context.extensionUri);
  const treeView = vscode.window.createTreeView(viewId, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  const decorationApplicationById = context.extensionMode === vscode.ExtensionMode.Test
    ? new Map<HeadingDecorationId, DecorationApplicationSnapshot>()
    : undefined;
  const decorationObserver: DecorationApplicationObserver | undefined =
    decorationApplicationById === undefined
      ? undefined
      : (editor, specification, range_rangeId): void => {
        decorationApplicationById.set(specification.id, {
          documentIdentity: editor.document.uri.toString(),
          specification: { ...specification },
          range_rangeId: range_rangeId.map((range: vscode.Range): SerializedDecorationRange => ({
            startLine: range.start.line,
            startCharacter: range.start.character,
            endLine: range.end.line,
            endCharacter: range.end.character,
          })),
        });
      };
  const decorationManager = decorationObserver === undefined
    ? new DecorationManager(context.extensionUri)
    : new DecorationManager(context.extensionUri, decorationObserver);
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
        controller.handleTreeVisibilityChange(treeView.visible);
        await controller.waitForPendingInteractions();
        await vscode.commands.executeCommand(`${viewId}.focus`);
      },
    ),
    vscode.commands.registerCommand(
      "tieredHeadings.navigate",
      (target: HeadingNavigationTarget): void => {
        controller.navigateToHeading(target);
      },
    ),
    vscode.window.onDidChangeActiveTextEditor((): void => {
      controller.refresh();
    }),
    vscode.window.onDidChangeTextEditorSelection(
      (event: vscode.TextEditorSelectionChangeEvent): void => {
        controller.handleTextEditorSelectionChange(event);
      },
    ),
    treeView.onDidChangeVisibility((event: vscode.TreeViewVisibilityChangeEvent): void => {
      controller.handleTreeVisibilityChange(event.visible);
    }),
    treeView.onDidCollapseElement((event: vscode.TreeViewExpansionEvent<HeadingNode>): void => {
      controller.handleNavigatorFoldingChange(event.element, false);
    }),
    treeView.onDidExpandElement((event: vscode.TreeViewExpansionEvent<HeadingNode>): void => {
      controller.handleNavigatorFoldingChange(event.element, true);
    }),
    vscode.workspace.onDidChangeTextDocument(
      (event: vscode.TextDocumentChangeEvent): void => {
        controller.scheduleRefresh(event);
      },
    ),
    vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument): void => {
      controller.forgetDocument(document);
    }),
    vscode.workspace.onDidGrantWorkspaceTrust((): void => {
      controller.resetConfigurationIssueNotifications();
      controller.refresh();
      foldingProvider.refresh();
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

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    disposable_disposableId.push(
      vscode.commands.registerCommand(
        "_tieredHeadings.getActiveSnapshot",
        (): ActiveHeadingSnapshot | undefined => controller.getActiveSnapshot(),
      ),
      vscode.commands.registerCommand(
        "_tieredHeadings.getTreeNavigationTargets",
        (): readonly unknown[] => provider.getNavigationTargetsForTesting(),
      ),
      vscode.commands.registerCommand(
        "_tieredHeadings.getDecorations",
        (): readonly DecorationApplicationSnapshot[] => (
          decorationApplicationById === undefined
            ? []
            : [...decorationApplicationById.values()]
        ),
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
        "_tieredHeadings.getTreeSelection",
        (): readonly unknown[] => treeView.selection.map((heading): unknown => ({
          id: heading.id,
          label: heading.label,
          line: heading.line,
        })),
      ),
      vscode.commands.registerCommand(
        "_tieredHeadings.focusTreeItem",
        async (headingId: string, expand: boolean | number = 1): Promise<boolean> => {
          const heading = provider.getNodeById(headingId);
          if (heading === undefined) {
            return false;
          }
          await treeView.reveal(heading, {
            select: true,
            focus: true,
            expand,
          });
          await controller.waitForPendingInteractions();
          return true;
        },
      ),
      vscode.commands.registerCommand(
        "_tieredHeadings.applyNavigatorFoldingState",
        (headingId: string, expanded: boolean): boolean => {
          const heading = provider.getNodeById(headingId);
          if (heading === undefined) {
            return false;
          }
          controller.handleNavigatorFoldingChange(heading, expanded);
          return true;
        },
      ),
      vscode.commands.registerCommand(
        "_tieredHeadings.waitForPendingInteractions",
        async (): Promise<void> => controller.waitForPendingInteractions(),
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
    );
  }

  context.subscriptions.push(...disposable_disposableId);
  controller.refresh();
}

export function deactivate(): void {
  // VS Code disposes all resources registered in the extension context.
}
