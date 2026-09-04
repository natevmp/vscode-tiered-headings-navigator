import * as vscode from "vscode";

import type { ConfigurationIssue } from "./configuration";
import { findCurrentHeading } from "./currentHeading";
import type { DecorationManager } from "./decorationManager";
import { buildHeadingHierarchy } from "./hierarchy";
import {
  reconcileHeadingIds,
  trackHeadingIdentityChanges,
  type HeadingIdentity,
  type HeadingTextChange,
} from "./headingIdentity";
import type { HeadingTreeProvider } from "./headingTreeProvider";
import type { Heading, HeadingNavigationTarget, HeadingNode } from "./model";
import { scanDocument } from "./scanner";
import { readHeadingSettings } from "./settings";

const scanDebounceMilliseconds = 150;
const cursorRevealRetryDelayMilliseconds = 100;
const cursorRevealAttemptCount = 6;
const cursorRevealRecoveryDelayMilliseconds = 1000;

interface ActiveHeadingModel {
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly foldingEnabled: boolean;
  readonly foldingSyncFromNavigator: boolean;
  readonly modelGeneration: number;
  readonly heading_headingId: Heading[];
}

interface NavigatorFoldingRequest {
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly expanded: boolean;
  readonly headingId: string;
  readonly line: number;
  readonly modelGeneration: number;
  readonly sequence: number;
}

interface CursorRevealRequest {
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly headingId: string;
  readonly headingKey: string;
  readonly initialDelayMilliseconds: number;
  readonly modelGeneration: number;
  readonly revealSequence: number;
}

interface CachedHeadingIdentityModel {
  readonly documentVersion: number;
  readonly identity_identityId: HeadingIdentity[];
}

export interface ActiveHeadingSnapshot {
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly modelGeneration: number;
  readonly heading_headingId: readonly Heading[];
}

/** Coordinates active-document scans, view updates, decorations, and navigation. */
export class HeadingController implements vscode.Disposable {
  private disposed = false;

  private activeModel: ActiveHeadingModel | undefined;

  private debounceTimer: NodeJS.Timeout | undefined;

  private activeIssueSignature: string | undefined;

  private readonly notifiedIssueSignatures = new Set<string>();

  private modelGeneration = 0;

  private headingIdentitySequence = 0;

  private readonly identityModelByDocument = new Map<string, CachedHeadingIdentityModel>();

  private revealedCursorHeadingKey: string | undefined;

  private pendingCursorHeadingKey: string | undefined;

  private cursorRevealOperation: Promise<void> = Promise.resolve();

  private cursorRevealSequence = 0;

  private cursorRevealRecoveryTimer: NodeJS.Timeout | undefined;

  private reportedCursorRevealErrorKey: string | undefined;

  private foldingOperation: Promise<void> = Promise.resolve();

  private foldingRequestSequence = 0;

  private foldingFlushScheduled = false;

  private readonly foldingRequestByHeadingId = new Map<string, NavigatorFoldingRequest>();

  public constructor(
    private readonly provider: HeadingTreeProvider,
    private readonly treeView: vscode.TreeView<HeadingNode>,
    private readonly decorationManager: DecorationManager,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  public refresh(): void {
    if (this.disposed) {
      return;
    }
    this.cancelScheduledRefresh();
    this.refreshEditor(vscode.window.activeTextEditor);
  }

  public resetConfigurationIssueNotifications(): void {
    this.notifiedIssueSignatures.clear();
  }

  public forgetDocument(document: vscode.TextDocument): void {
    this.identityModelByDocument.delete(document.uri.toString());
  }

  public scheduleRefresh(event: vscode.TextDocumentChangeEvent): void {
    if (this.disposed) {
      return;
    }
    const { document } = event;
    if (!this.trackDocumentChanges(event)) {
      return;
    }
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor === undefined || activeEditor.document !== document) {
      return;
    }

    this.cancelScheduledRefresh();
    const documentIdentity = document.uri.toString();
    const documentVersion = document.version;
    this.debounceTimer = setTimeout((): void => {
      this.debounceTimer = undefined;
      const currentEditor = vscode.window.activeTextEditor;
      if (
        currentEditor === undefined
        || currentEditor.document.uri.toString() !== documentIdentity
        || currentEditor.document.version < documentVersion
      ) {
        return;
      }
      this.refreshEditor(currentEditor);
    }, scanDebounceMilliseconds);
  }

  private trackDocumentChanges(event: vscode.TextDocumentChangeEvent): boolean {
    const documentIdentity = event.document.uri.toString();
    const cachedModel = this.identityModelByDocument.get(documentIdentity);
    if (event.contentChanges.length === 0) {
      const activeModelIsCurrent = this.activeModel?.documentIdentity === documentIdentity
        && this.activeModel.documentVersion === event.document.version;
      if (
        cachedModel?.documentVersion === event.document.version
        || activeModelIsCurrent
      ) {
        return false;
      }
      this.identityModelByDocument.delete(documentIdentity);
      return true;
    }
    if (cachedModel === undefined) {
      return true;
    }
    if (cachedModel.documentVersion + 1 !== event.document.version) {
      this.identityModelByDocument.delete(documentIdentity);
      return true;
    }
    const change_changeId: HeadingTextChange[] = event.contentChanges.map(
      (change: vscode.TextDocumentContentChangeEvent): HeadingTextChange => ({
        rangeOffset: change.rangeOffset,
        rangeLength: change.rangeLength,
        textLength: change.text.length,
      }),
    );
    this.identityModelByDocument.set(documentIdentity, {
      documentVersion: event.document.version,
      identity_identityId: trackHeadingIdentityChanges(
        cachedModel.identity_identityId,
        change_changeId,
      ),
    });
    return true;
  }

  public getActiveSnapshot(): ActiveHeadingSnapshot | undefined {
    if (this.activeModel === undefined) {
      return undefined;
    }
    return {
      documentIdentity: this.activeModel.documentIdentity,
      documentVersion: this.activeModel.documentVersion,
      modelGeneration: this.activeModel.modelGeneration,
      heading_headingId: [...this.activeModel.heading_headingId],
    };
  }

  public handleTextEditorSelectionChange(
    event: vscode.TextEditorSelectionChangeEvent,
  ): void {
    if (this.disposed || event.textEditor !== vscode.window.activeTextEditor) {
      return;
    }
    this.revealCurrentHeading(event.textEditor);
  }

  public handleTreeVisibilityChange(visible: boolean): void {
    if (this.disposed) {
      return;
    }
    if (!visible) {
      this.invalidateCursorRevealState();
      return;
    }
    this.revealCurrentHeading(vscode.window.activeTextEditor, true);
  }

  public handleNavigatorFoldingChange(
    heading: HeadingNode,
    expanded: boolean,
  ): void {
    const editor = vscode.window.activeTextEditor;
    const activeModel = this.activeModel;
    const headingIsCurrent = this.provider.isCurrentNode(heading);
    if (!expanded && headingIsCurrent) {
      // A collapsed ancestor can hide the row remembered as successfully revealed.
      this.invalidateCursorRevealState();
    }
    if (
      this.disposed
      || editor === undefined
      || activeModel === undefined
      || heading.heading_childId.length === 0
      || !headingIsCurrent
      || !activeModel.foldingEnabled
      || !activeModel.foldingSyncFromNavigator
      || editor.document.uri.toString() !== activeModel.documentIdentity
      || heading.documentIdentity !== activeModel.documentIdentity
      || editor.document.version !== activeModel.documentVersion
    ) {
      return;
    }

    this.foldingRequestSequence += 1;
    this.foldingRequestByHeadingId.set(heading.id, {
      documentIdentity: activeModel.documentIdentity,
      documentVersion: activeModel.documentVersion,
      expanded,
      headingId: heading.id,
      line: heading.line,
      modelGeneration: activeModel.modelGeneration,
      sequence: this.foldingRequestSequence,
    });
    this.scheduleFoldingFlush();
  }

  public async waitForPendingInteractions(): Promise<void> {
    await new Promise<void>((resolve): void => {
      queueMicrotask(resolve);
    });
    await this.foldingOperation;
    await this.cursorRevealOperation;
  }

  public navigateToHeading(target: HeadingNavigationTarget): void {
    if (this.disposed) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const activeModel = this.activeModel;
    const activeDocumentIdentity = editor?.document.uri.toString();
    const targetIsCurrent = editor !== undefined
      && activeModel !== undefined
      && activeDocumentIdentity === target.documentIdentity
      && activeModel.documentIdentity === target.documentIdentity
      && editor.document.version === target.documentVersion
      && activeModel.documentVersion === target.documentVersion
      && activeModel.modelGeneration === target.modelGeneration;

    if (!targetIsCurrent) {
      if (
        editor !== undefined
        && (
          activeModel === undefined
          || activeModel.documentIdentity !== activeDocumentIdentity
          || activeModel.documentVersion !== editor.document.version
        )
      ) {
        this.cancelScheduledRefresh();
        this.refreshEditor(editor);
      }
      void vscode.window.showInformationMessage(
        "The heading list changed. Select the heading again.",
      );
      return;
    }

    const currentTarget = activeModel.heading_headingId.find(
      (heading: Heading): boolean => heading.id === target.headingId,
    );
    if (currentTarget === undefined) {
      void vscode.window.showInformationMessage(
        "That heading no longer exists in the document.",
      );
      return;
    }

    const start = new vscode.Position(
      currentTarget.line,
      currentTarget.startCharacter,
    );
    const range = new vscode.Range(
      start,
      new vscode.Position(currentTarget.line, currentTarget.endCharacter),
    );
    editor.selection = new vscode.Selection(start, start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private revealCurrentHeading(
    editor: vscode.TextEditor | undefined,
    force = false,
  ): void {
    const activeModel = this.activeModel;
    if (
      this.disposed
      || editor === undefined
      || editor !== vscode.window.activeTextEditor
      || activeModel === undefined
      || editor.document.uri.toString() !== activeModel.documentIdentity
      || editor.document.version !== activeModel.documentVersion
    ) {
      this.invalidateCursorRevealState();
      return;
    }

    const currentHeading = findCurrentHeading(
      activeModel.heading_headingId,
      editor.selection.active.line,
    );
    if (currentHeading === undefined) {
      // The stable TreeView API cannot clear an existing native selection.
      this.invalidateCursorRevealState();
      return;
    }

    const headingKey = JSON.stringify([
      activeModel.documentIdentity,
      activeModel.modelGeneration,
      currentHeading.id,
    ]);
    if (!this.treeView.visible) {
      this.invalidateCursorRevealState();
      return;
    }
    const treeSelectionMatches = this.treeView.selection.length === 1
      && this.treeView.selection[0]?.id === currentHeading.id;
    if (
      this.pendingCursorHeadingKey === headingKey
      || (this.revealedCursorHeadingKey === headingKey && treeSelectionMatches)
    ) {
      return;
    }

    this.cancelCursorRevealRecovery();
    this.cursorRevealSequence += 1;
    const request: CursorRevealRequest = {
      documentIdentity: activeModel.documentIdentity,
      documentVersion: activeModel.documentVersion,
      headingId: currentHeading.id,
      headingKey,
      initialDelayMilliseconds: force ? cursorRevealRetryDelayMilliseconds : 0,
      modelGeneration: activeModel.modelGeneration,
      revealSequence: this.cursorRevealSequence,
    };
    this.pendingCursorHeadingKey = headingKey;

    this.cursorRevealOperation = this.cursorRevealOperation
      .then(async (): Promise<void> => {
        try {
          await this.revealCursorHeading(request);
        } finally {
          if (
            request.revealSequence === this.cursorRevealSequence
            && this.pendingCursorHeadingKey === request.headingKey
          ) {
            this.pendingCursorHeadingKey = undefined;
          }
        }
      })
      .catch((error: unknown): void => {
        if (this.cursorRevealRequestIsCurrent(request)) {
          if (this.reportedCursorRevealErrorKey !== request.headingKey) {
            this.reportedCursorRevealErrorKey = request.headingKey;
            this.reportInteractionError("could not follow the editor cursor", error);
          }
          this.scheduleCursorRevealRecovery(request);
        }
      });
  }

  private async revealCursorHeading(request: CursorRevealRequest): Promise<void> {
    if (!this.cursorRevealRequestIsCurrent(request)) {
      return;
    }
    if (request.initialDelayMilliseconds > 0) {
      await this.waitForCursorRevealRetry(request.initialDelayMilliseconds);
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < cursorRevealAttemptCount; attempt += 1) {
      if (!this.cursorRevealRequestIsCurrent(request)) {
        return;
      }

      const currentNode = this.provider.getNodeById(request.headingId);
      if (currentNode === undefined) {
        lastError = new Error(`heading ${request.headingId} is not in the current tree`);
      } else {
        try {
          await this.treeView.reveal(currentNode, {
            select: true,
            focus: false,
            expand: false,
          });
          if (this.cursorRevealRequestIsCurrent(request)) {
            this.revealedCursorHeadingKey = request.headingKey;
            this.reportedCursorRevealErrorKey = undefined;
          }
          return;
        } catch (error: unknown) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      if (attempt + 1 < cursorRevealAttemptCount) {
        await this.waitForCursorRevealRetry(cursorRevealRetryDelayMilliseconds);
      }
    }

    throw lastError ?? new Error(`heading ${request.headingId} could not be revealed`);
  }

  private scheduleCursorRevealRecovery(request: CursorRevealRequest): void {
    this.cancelCursorRevealRecovery();
    this.cursorRevealRecoveryTimer = setTimeout((): void => {
      this.cursorRevealRecoveryTimer = undefined;
      if (!this.cursorRevealRequestIsCurrent(request)) {
        return;
      }
      this.pendingCursorHeadingKey = undefined;
      this.revealCurrentHeading(vscode.window.activeTextEditor, true);
    }, cursorRevealRecoveryDelayMilliseconds);
  }

  private cursorRevealRequestIsCurrent(request: CursorRevealRequest): boolean {
    const currentEditor = vscode.window.activeTextEditor;
    const currentModel = this.activeModel;
    return !this.disposed
      && request.revealSequence === this.cursorRevealSequence
      && this.treeView.visible
      && currentEditor !== undefined
      && currentModel !== undefined
      && currentEditor.document.uri.toString() === request.documentIdentity
      && currentEditor.document.version === request.documentVersion
      && currentModel.documentIdentity === request.documentIdentity
      && currentModel.documentVersion === request.documentVersion
      && currentModel.modelGeneration === request.modelGeneration
      && findCurrentHeading(
        currentModel.heading_headingId,
        currentEditor.selection.active.line,
      )?.id === request.headingId;
  }

  private async waitForCursorRevealRetry(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, milliseconds);
    });
  }

  private invalidateCursorRevealState(): void {
    this.revealedCursorHeadingKey = undefined;
    this.pendingCursorHeadingKey = undefined;
    this.reportedCursorRevealErrorKey = undefined;
    this.cursorRevealSequence += 1;
    this.cancelCursorRevealRecovery();
  }

  private cancelCursorRevealRecovery(): void {
    if (this.cursorRevealRecoveryTimer !== undefined) {
      clearTimeout(this.cursorRevealRecoveryTimer);
      this.cursorRevealRecoveryTimer = undefined;
    }
  }

  private scheduleFoldingFlush(): void {
    if (this.foldingFlushScheduled) {
      return;
    }
    this.foldingFlushScheduled = true;
    queueMicrotask((): void => {
      this.foldingFlushScheduled = false;
      const request_requestId = [...this.foldingRequestByHeadingId.values()].sort(
        (left: NavigatorFoldingRequest, right: NavigatorFoldingRequest): number => (
          left.sequence - right.sequence
        ),
      );
      this.foldingRequestByHeadingId.clear();
      if (request_requestId.length === 0) {
        return;
      }

      this.foldingOperation = this.foldingOperation
        .then(async (): Promise<void> => {
          if (this.disposed) {
            return;
          }
          let groupStartIndex = 0;
          while (groupStartIndex < request_requestId.length) {
            const expanded = request_requestId[groupStartIndex]!.expanded;
            let groupEndIndex = groupStartIndex + 1;
            while (
              groupEndIndex < request_requestId.length
              && request_requestId[groupEndIndex]!.expanded === expanded
            ) {
              groupEndIndex += 1;
            }
            await this.applyNavigatorFoldingRequests(
              request_requestId.slice(groupStartIndex, groupEndIndex),
            );
            groupStartIndex = groupEndIndex;
          }
        })
        .catch((error: unknown): void => {
          this.reportInteractionError("could not synchronize navigator folding", error);
        });
    });
  }

  private async applyNavigatorFoldingRequests(
    request_requestId: readonly NavigatorFoldingRequest[],
  ): Promise<void> {
    const firstRequest = request_requestId[0];
    const editor = vscode.window.activeTextEditor;
    const activeModel = this.activeModel;
    if (
      this.disposed
      || firstRequest === undefined
      || editor === undefined
      || activeModel === undefined
      || !activeModel.foldingEnabled
      || !activeModel.foldingSyncFromNavigator
      || editor.document.uri.toString() !== firstRequest.documentIdentity
      || editor.document.version !== firstRequest.documentVersion
      || activeModel.documentIdentity !== firstRequest.documentIdentity
      || activeModel.documentVersion !== firstRequest.documentVersion
      || activeModel.modelGeneration !== firstRequest.modelGeneration
    ) {
      return;
    }

    const editorConfiguration = vscode.workspace.getConfiguration(
      "editor",
      {
        uri: editor.document.uri,
        languageId: editor.document.languageId,
      },
    );
    if (
      !editorConfiguration.get<boolean>("folding", true)
      || editorConfiguration.get<string>("foldingStrategy", "auto") === "indentation"
    ) {
      return;
    }

    const lineSet = new Set<number>();
    request_requestId.forEach((request: NavigatorFoldingRequest): void => {
      if (
        request.expanded !== firstRequest.expanded
        || request.documentIdentity !== activeModel.documentIdentity
        || request.documentVersion !== activeModel.documentVersion
        || request.modelGeneration !== activeModel.modelGeneration
      ) {
        return;
      }
      const currentNode = this.provider.getNodeById(request.headingId);
      if (
        currentNode !== undefined
        && currentNode.line === request.line
        && currentNode.heading_childId.length > 0
      ) {
        lineSet.add(request.line);
      }
    });
    const line_lineId = [...lineSet].sort((left: number, right: number): number => (
      left - right
    ));
    if (line_lineId.length === 0) {
      return;
    }

    if (this.disposed) {
      return;
    }

    await vscode.commands.executeCommand(
      firstRequest.expanded ? "editor.unfold" : "editor.fold",
      {
        direction: "down",
        levels: 1,
        selectionLines: line_lineId,
      },
    );
  }

  private invalidatePendingInteractions(): void {
    this.invalidateCursorRevealState();
    this.foldingRequestByHeadingId.clear();
  }

  private reportInteractionError(message: string, error: unknown): void {
    if (this.disposed) {
      return;
    }
    const detail = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`Tiered Headings ${message}: ${detail}`);
  }

  private refreshEditor(editor: vscode.TextEditor | undefined): void {
    if (this.disposed) {
      return;
    }
    this.modelGeneration += 1;
    this.invalidatePendingInteractions();
    if (editor === undefined) {
      this.activeModel = undefined;
      this.provider.setHeadings([], this.modelGeneration, 0);
      this.decorationManager.clear();
      this.treeView.description = "";
      this.treeView.message = "Open a text document to see its headings.";
      this.reportConfigurationIssues([]);
      return;
    }

    const { document } = editor;
    const settings = readHeadingSettings(document);
    const documentIdentity = document.uri.toString();
    const scannedHeading_headingId = scanDocument(
      document.getText(),
      documentIdentity,
      settings.trigger_triggerId,
      settings.caseSensitive,
    );
    const cachedIdentityModel = this.identityModelByDocument.get(documentIdentity);
    const previousIdentity_identityId = cachedIdentityModel?.documentVersion === document.version
      ? cachedIdentityModel.identity_identityId
      : [];
    const reconciledResult = reconcileHeadingIds(
      previousIdentity_identityId,
      scannedHeading_headingId,
      (heading: Heading) => ({
        startOffset: document.offsetAt(new vscode.Position(
          heading.line,
          heading.startCharacter,
        )),
        endOffset: document.offsetAt(new vscode.Position(
          heading.line,
          heading.endCharacter,
        )),
      }),
      (): string => {
        this.headingIdentitySequence += 1;
        return `heading:${JSON.stringify([
          documentIdentity,
          this.headingIdentitySequence,
        ])}`;
      },
    );
    const { heading_headingId } = reconciledResult;
    this.identityModelByDocument.set(documentIdentity, {
      documentVersion: document.version,
      identity_identityId: reconciledResult.identity_identityId,
    });

    this.activeModel = {
      documentIdentity,
      documentVersion: document.version,
      foldingEnabled: settings.foldingEnabled,
      foldingSyncFromNavigator: settings.foldingSyncFromNavigator,
      modelGeneration: this.modelGeneration,
      heading_headingId,
    };
    this.provider.setHeadings(
      buildHeadingHierarchy(heading_headingId),
      this.modelGeneration,
      document.version,
    );
    this.decorationManager.update(
      editor,
      heading_headingId,
      settings.gutterEnabled,
      settings.styleByLevel,
    );
    this.treeView.description = this.getDocumentDescription(document);
    this.treeView.message = this.getViewMessage(
      settings.trigger_triggerId.length,
      heading_headingId.length,
    ) ?? "";
    this.reportConfigurationIssues(settings.issue_issueId);
    this.revealCurrentHeading(editor, true);
  }

  private getDocumentDescription(document: vscode.TextDocument): string {
    if (document.isUntitled) {
      return document.fileName.length > 0 ? document.fileName : "Untitled";
    }
    return vscode.workspace.asRelativePath(document.uri, false);
  }

  private getViewMessage(triggerCount: number, headingCount: number): string | undefined {
    if (triggerCount === 0) {
      return "No valid heading triggers are configured. Use the gear button to add one.";
    }
    if (headingCount === 0) {
      return "No headings were found in the active document.";
    }
    return undefined;
  }

  private reportConfigurationIssues(
    issue_issueId: readonly ConfigurationIssue[],
  ): void {
    if (issue_issueId.length === 0) {
      this.activeIssueSignature = undefined;
      this.outputChannel.clear();
      return;
    }

    const issueSignature = JSON.stringify(
      issue_issueId.map((issue): string => issue.message),
    );
    if (this.activeIssueSignature !== issueSignature) {
      this.activeIssueSignature = issueSignature;
      this.outputChannel.clear();
      this.outputChannel.appendLine("Invalid Tiered Headings configuration:");
      issue_issueId.forEach((issue): void => {
        this.outputChannel.appendLine(`- ${issue.message}`);
      });
    }

    if (this.notifiedIssueSignatures.has(issueSignature)) {
      return;
    }
    this.notifiedIssueSignatures.add(issueSignature);
    const settingKeys = new Set(
      issue_issueId.flatMap((issue: ConfigurationIssue): string[] => (
        issue.settingKey === undefined ? [] : [issue.settingKey]
      )),
    );
    let settingsQuery = "tieredHeadings";
    if (settingKeys.size === 1) {
      settingKeys.forEach((settingKey: string): void => {
        settingsQuery = settingKey;
      });
    }
    void vscode.window.showWarningMessage(
      `Tiered Headings found ${issue_issueId.length} configuration issue${issue_issueId.length === 1 ? "" : "s"}.`,
      "Open Settings",
      "Show Details",
    ).then(async (selection: string | undefined): Promise<void> => {
      if (selection === "Open Settings") {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          settingsQuery,
        );
      } else if (selection === "Show Details") {
        this.outputChannel.show();
      }
    });
  }

  private cancelScheduledRefresh(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelScheduledRefresh();
    this.modelGeneration += 1;
    this.activeModel = undefined;
    this.invalidatePendingInteractions();
    this.identityModelByDocument.clear();
  }
}
