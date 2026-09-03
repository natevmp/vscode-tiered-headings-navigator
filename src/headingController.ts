import * as vscode from "vscode";

import type { ConfigurationIssue } from "./configuration";
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

interface ActiveHeadingModel {
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly modelGeneration: number;
  readonly heading_headingId: Heading[];
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
  private activeModel: ActiveHeadingModel | undefined;

  private debounceTimer: NodeJS.Timeout | undefined;

  private activeIssueSignature: string | undefined;

  private readonly notifiedIssueSignatures = new Set<string>();

  private modelGeneration = 0;

  private headingIdentitySequence = 0;

  private readonly identityModelByDocument = new Map<string, CachedHeadingIdentityModel>();

  public constructor(
    private readonly provider: HeadingTreeProvider,
    private readonly treeView: vscode.TreeView<HeadingNode>,
    private readonly decorationManager: DecorationManager,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  public refresh(): void {
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
      ...this.activeModel,
      heading_headingId: [...this.activeModel.heading_headingId],
    };
  }

  public navigateToHeading(target: HeadingNavigationTarget): void {
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

  private refreshEditor(editor: vscode.TextEditor | undefined): void {
    this.modelGeneration += 1;
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
    this.cancelScheduledRefresh();
    this.identityModelByDocument.clear();
  }
}
