import * as vscode from "vscode";

import type { HeadingNavigationTarget, HeadingNode } from "./model";
import { getHeadingMarkerPresentation } from "./headingPresentation";

const navigateCommand = "tieredHeadings.navigate";

/** Presents the current document's heading hierarchy as a native VS Code tree. */
export class HeadingTreeProvider
implements vscode.TreeDataProvider<HeadingNode>, vscode.Disposable {
  private readonly changeTreeDataEmitter = new vscode.EventEmitter<
  HeadingNode | undefined | void
  >();

  public readonly onDidChangeTreeData = this.changeTreeDataEmitter.event;

  private heading_rootId: HeadingNode[] = [];

  private navigationTargetByNode = new WeakMap<HeadingNode, HeadingNavigationTarget>();

  private nodeByHeadingId = new Map<string, HeadingNode>();

  private parentByNode = new WeakMap<HeadingNode, HeadingNode>();

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public getTreeItem(element: HeadingNode): vscode.TreeItem {
    const collapsibleState = element.heading_childId.length > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(element.label, collapsibleState);
    item.id = element.id;
    const lineNumber = element.line + 1;
    item.description = `line ${lineNumber}`;
    item.tooltip = `${element.sourceLine}\nLevel ${element.level}, line ${lineNumber}`;
    item.accessibilityInformation = {
      label: `${element.label}, level ${element.level}, line ${lineNumber}`,
    };
    item.contextValue = "tieredHeading";
    const markerPresentation = getHeadingMarkerPresentation(element.level);
    item.iconPath = markerPresentation.paneIcon.kind === "theme"
      ? new vscode.ThemeIcon(markerPresentation.paneIcon.themeIconId)
      : {
        light: vscode.Uri.joinPath(
          this.extensionUri,
          "resources",
          "light",
          markerPresentation.assetName,
        ),
        dark: vscode.Uri.joinPath(
          this.extensionUri,
          "resources",
          "dark",
          markerPresentation.assetName,
        ),
      };
    const navigationTarget = this.navigationTargetByNode.get(element);
    if (navigationTarget !== undefined) {
      item.command = {
        command: navigateCommand,
        title: "Go to Heading",
        arguments: [navigationTarget],
      };
    }
    return item;
  }

  public getChildren(element?: HeadingNode): HeadingNode[] {
    return element === undefined
      ? [...this.heading_rootId]
      : [...element.heading_childId];
  }

  public getParent(element: HeadingNode): HeadingNode | undefined {
    return this.parentByNode.get(element);
  }

  public getNodeById(headingId: string): HeadingNode | undefined {
    return this.nodeByHeadingId.get(headingId);
  }

  public isCurrentNode(element: HeadingNode): boolean {
    return this.nodeByHeadingId.get(element.id) === element;
  }

  /** Returns arguments built through getTreeItem for Extension Host tests. */
  public getNavigationTargetsForTesting(): readonly unknown[] {
    const target_targetId: unknown[] = [];
    const collectTarget = (heading: HeadingNode): void => {
      const argument_argumentId = this.getTreeItem(heading).command?.arguments as
        | unknown[]
        | undefined;
      const target = argument_argumentId?.[0];
      if (target !== undefined) {
        target_targetId.push(target);
      }
      heading.heading_childId.forEach(collectTarget);
    };
    this.heading_rootId.forEach(collectTarget);
    return target_targetId;
  }

  /** Returns native items for Extension Host presentation checks. */
  public getTreeItemsForTesting(): readonly vscode.TreeItem[] {
    const item_itemId: vscode.TreeItem[] = [];
    const collectItem = (heading: HeadingNode): void => {
      item_itemId.push(this.getTreeItem(heading));
      heading.heading_childId.forEach(collectItem);
    };
    this.heading_rootId.forEach(collectItem);
    return item_itemId;
  }

  public setHeadings(
    heading_rootId: HeadingNode[],
    modelGeneration: number,
    documentVersion: number,
  ): void {
    this.heading_rootId = heading_rootId;
    this.navigationTargetByNode = new WeakMap<HeadingNode, HeadingNavigationTarget>();
    this.nodeByHeadingId = new Map<string, HeadingNode>();
    this.parentByNode = new WeakMap<HeadingNode, HeadingNode>();
    heading_rootId.forEach((heading: HeadingNode): void => {
      this.registerNode(heading, undefined, modelGeneration, documentVersion);
    });
    this.changeTreeDataEmitter.fire();
  }

  private registerNode(
    heading: HeadingNode,
    parent: HeadingNode | undefined,
    modelGeneration: number,
    documentVersion: number,
  ): void {
    this.nodeByHeadingId.set(heading.id, heading);
    if (parent !== undefined) {
      this.parentByNode.set(heading, parent);
    }
    this.navigationTargetByNode.set(heading, {
      headingId: heading.id,
      documentIdentity: heading.documentIdentity,
      documentVersion,
      modelGeneration,
    });
    heading.heading_childId.forEach((child: HeadingNode): void => {
      this.registerNode(child, heading, modelGeneration, documentVersion);
    });
  }

  public dispose(): void {
    this.changeTreeDataEmitter.dispose();
  }
}
