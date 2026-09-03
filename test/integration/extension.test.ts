import assert from "node:assert/strict";

import * as vscode from "vscode";

interface HeadingSnapshot {
  readonly id: string;
  readonly label: string;
  readonly level: number;
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly documentIdentity: string;
}

interface ActiveHeadingSnapshot {
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly modelGeneration: number;
  readonly heading_headingId: readonly HeadingSnapshot[];
}

interface HeadingNavigationTarget {
  readonly headingId: string;
  readonly documentIdentity: string;
  readonly documentVersion: number;
  readonly modelGeneration: number;
}

const extensionId = "local.tiered-headings-navigator";
const inspectCommand = "_tieredHeadings.getActiveSnapshot";
const inspectTargetsCommand = "_tieredHeadings.getTreeNavigationTargets";
const inspectViewVisibleCommand = "_tieredHeadings.isViewVisible";
const inspectTreeItemsCommand = "_tieredHeadings.getTreeItems";

async function openSampleDocument(): Promise<vscode.TextEditor> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder === undefined) {
    throw new Error("The integration workspace must be open.");
  }
  const documentUri = vscode.Uri.joinPath(workspaceFolder.uri, "sample.txt");
  const document = await vscode.workspace.openTextDocument(documentUri);
  return vscode.window.showTextDocument(document, { preview: false });
}

async function readActiveSnapshot(): Promise<ActiveHeadingSnapshot | undefined> {
  return vscode.commands.executeCommand<ActiveHeadingSnapshot | undefined>(inspectCommand);
}

async function readTreeNavigationTargets(): Promise<readonly HeadingNavigationTarget[]> {
  return vscode.commands.executeCommand<readonly HeadingNavigationTarget[]>(
    inspectTargetsCommand,
  );
}

async function getTreeNavigationTarget(headingId: string): Promise<HeadingNavigationTarget> {
  const target_targetId = await readTreeNavigationTargets();
  const target = target_targetId.find(
    (candidate: HeadingNavigationTarget): boolean => candidate.headingId === headingId,
  );
  if (target === undefined) {
    throw new Error(`Tree item command target ${headingId} was not found.`);
  }
  return target;
}

async function waitForHeadingCount(
  expectedCount: number,
): Promise<ActiveHeadingSnapshot> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const snapshot = await readActiveSnapshot();
    if (snapshot?.heading_headingId.length === expectedCount) {
      return snapshot;
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 50);
    });
  }
  const snapshot = await readActiveSnapshot();
  if (snapshot === undefined) {
    throw new Error("The extension did not expose an active heading model.");
  }
  assert.equal(snapshot.heading_headingId.length, expectedCount);
  return snapshot;
}

async function waitForNewerModel(
  previousGeneration: number,
  expectedCount: number,
): Promise<ActiveHeadingSnapshot> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const snapshot = await readActiveSnapshot();
    if (
      snapshot !== undefined
      && snapshot.modelGeneration > previousGeneration
      && snapshot.heading_headingId.length === expectedCount
    ) {
      return snapshot;
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error("The heading model did not refresh before the timeout.");
}

async function waitForViewVisibility(expectedVisibility: boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const viewVisible = await vscode.commands.executeCommand<boolean>(
      inspectViewVisibleCommand,
    );
    if (viewVisible === expectedVisibility) {
      return;
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 50);
    });
  }
  assert.equal(
    await vscode.commands.executeCommand<boolean>(inspectViewVisibleCommand),
    expectedVisibility,
  );
}

suite("Tiered Headings extension", (): void => {
  suiteSetup(async (): Promise<void> => {
    await openSampleDocument();
    const extension = vscode.extensions.getExtension(extensionId);
    if (extension === undefined) {
      throw new Error(`Extension ${extensionId} was not found.`);
    }
    const deadline = Date.now() + 3000;
    while (!extension.isActive && Date.now() < deadline) {
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, 50);
      });
    }
    assert.equal(extension.isActive, true, "onStartupFinished should activate the extension");
  });

  test("scans the configured headings in the active document", async (): Promise<void> => {
    await openSampleDocument();
    await vscode.commands.executeCommand("tieredHeadings.refresh");

    const { heading_headingId } = await waitForHeadingCount(3);
    assert.deepEqual(
      heading_headingId.map((heading): [string, number, number] => [
        heading.label,
        heading.level,
        heading.line,
      ]),
      [
        ["Introduction", 1, 0],
        ["Installation", 2, 2],
        ["Details", 3, 4],
      ],
    );
  });

  test("shows and focuses the Headings view", async (): Promise<void> => {
    await vscode.commands.executeCommand("tieredHeadings.showHeadings");
    await waitForViewVisibility(true);
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await waitForViewVisibility(false);

    await vscode.commands.executeCommand("tieredHeadings.showHeadings");

    await waitForViewVisibility(true);
  });

  test("uses light and dark level icons for native tree items", async (): Promise<void> => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder === undefined) {
      throw new Error("The integration workspace must be open.");
    }
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceFolder.uri, "hierarchy-demo.txt"),
    );
    await vscode.window.showTextDocument(document, { preview: false });
    await waitForHeadingCount(8);
    const item_itemId = await vscode.commands.executeCommand<readonly vscode.TreeItem[]>(
      inspectTreeItemsCommand,
    );
    const expectedIconByLevel = new Map([
      ["L1", "heading-1.svg"],
      ["L2", "heading-2.svg"],
      ["L3", "heading-3.svg"],
      ["L4", "heading-higher.svg"],
    ]);

    expectedIconByLevel.forEach((expectedIcon: string, levelDescription: string): void => {
      const item = item_itemId.find(
        (candidate: vscode.TreeItem): boolean => (
          typeof candidate.description === "string"
          && candidate.description.startsWith(levelDescription)
        ),
      );
      if (item === undefined) {
        throw new Error(`Tree item ${levelDescription} was not found.`);
      }
      const iconPath = item.iconPath as { light: vscode.Uri; dark: vscode.Uri } | undefined;
      assert.equal(iconPath?.light.path.endsWith(`/resources/light/${expectedIcon}`), true);
      assert.equal(iconPath?.dark.path.endsWith(`/resources/dark/${expectedIcon}`), true);
    });

    await openSampleDocument();
    await waitForHeadingCount(3);
  });

  test("navigates to the selected trigger", async (): Promise<void> => {
    const editor = await openSampleDocument();
    await vscode.commands.executeCommand("tieredHeadings.refresh");
    const snapshot = await waitForHeadingCount(3);
    const { heading_headingId } = snapshot;
    const target = heading_headingId[2];
    if (target === undefined) {
      throw new Error("Expected the third heading to exist.");
    }

    const navigationTarget = await getTreeNavigationTarget(target.id);
    assert.equal(navigationTarget.documentIdentity, snapshot.documentIdentity);
    assert.equal(navigationTarget.documentVersion, snapshot.documentVersion);
    assert.equal(navigationTarget.modelGeneration, snapshot.modelGeneration);

    await vscode.commands.executeCommand("tieredHeadings.navigate", navigationTarget);

    assert.equal(editor.selection.active.line, 4);
    assert.equal(editor.selection.active.character, 3);
  });

  test("rejects navigation from a stale document version", async (): Promise<void> => {
    const editor = await openSampleDocument();
    await vscode.commands.executeCommand("tieredHeadings.refresh");
    const snapshot = await waitForHeadingCount(3);
    const target = snapshot.heading_headingId[0];
    if (target === undefined) {
      throw new Error("Expected the first heading to exist.");
    }
    const staleTarget = await getTreeNavigationTarget(target.id);

    const inserted = await editor.edit((builder): void => {
      builder.insert(new vscode.Position(0, 0), "ordinary line\n");
    });
    assert.equal(inserted, true);
    const selectionAfterEdit = editor.selection.active;

    await vscode.commands.executeCommand("tieredHeadings.navigate", staleTarget);

    assert.equal(editor.selection.active.line, selectionAfterEdit.line);
    assert.equal(editor.selection.active.character, selectionAfterEdit.character);
    await vscode.commands.executeCommand("undo");
    await waitForHeadingCount(3);
  });

  test("does not reopen a document for a stale tree command", async (): Promise<void> => {
    const sampleEditor = await openSampleDocument();
    await vscode.commands.executeCommand("tieredHeadings.refresh");
    const snapshot = await waitForHeadingCount(3);
    const target = snapshot.heading_headingId[0];
    if (target === undefined) {
      throw new Error("Expected the first heading to exist.");
    }
    const staleTarget = await getTreeNavigationTarget(target.id);
    const otherDocument = await vscode.workspace.openTextDocument({
      content: "This document has no configured headings.",
      language: "plaintext",
    });
    await vscode.window.showTextDocument(otherDocument, { preview: false });

    await vscode.commands.executeCommand("tieredHeadings.navigate", staleTarget);

    assert.equal(vscode.window.activeTextEditor?.document, otherDocument);
    await vscode.window.showTextDocument(sampleEditor.document, { preview: false });
    await waitForHeadingCount(3);
  });

  test("rejects an old generation after switching away and back", async (): Promise<void> => {
    const sampleEditor = await openSampleDocument();
    await vscode.commands.executeCommand("tieredHeadings.refresh");
    const originalSnapshot = await waitForHeadingCount(3);
    const targetHeading = originalSnapshot.heading_headingId[0];
    if (targetHeading === undefined) {
      throw new Error("Expected the first heading to exist.");
    }
    const staleTarget = await getTreeNavigationTarget(targetHeading.id);
    const otherDocument = await vscode.workspace.openTextDocument({
      content: "Temporary editor",
      language: "plaintext",
    });
    await vscode.window.showTextDocument(otherDocument, { preview: false });
    await vscode.window.showTextDocument(sampleEditor.document, { preview: false });
    const currentSnapshot = await waitForHeadingCount(3);
    assert.notEqual(currentSnapshot.modelGeneration, staleTarget.modelGeneration);
    const restingPosition = new vscode.Position(4, 0);
    sampleEditor.selection = new vscode.Selection(restingPosition, restingPosition);

    await vscode.commands.executeCommand("tieredHeadings.navigate", staleTarget);

    assert.equal(sampleEditor.selection.active.line, restingPosition.line);
    assert.equal(sampleEditor.selection.active.character, restingPosition.character);
  });

  test("keeps identity with the surviving identical heading", async (): Promise<void> => {
    const editor = await openSampleDocument();
    const originalText = editor.document.getText();
    try {
      const replaced = await editor.edit((builder): void => {
        builder.replace(
          new vscode.Range(
            new vscode.Position(0, 0),
            editor.document.positionAt(editor.document.getText().length),
          ),
          "@h1 Same\n@h1 Same",
        );
      });
      assert.equal(replaced, true);
      const duplicateSnapshot = await waitForHeadingCount(2);
      const firstId = duplicateSnapshot.heading_headingId[0]?.id;
      const secondId = duplicateSnapshot.heading_headingId[1]?.id;
      assert.notEqual(firstId, undefined);
      assert.notEqual(secondId, undefined);

      const changed = await editor.edit((builder): void => {
        builder.delete(new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(1, 0),
        ));
        builder.insert(
          editor.document.positionAt(editor.document.getText().length),
          "\n@h1 Same",
        );
      });
      assert.equal(changed, true);
      const changedSnapshot = await waitForNewerModel(
        duplicateSnapshot.modelGeneration,
        2,
      );

      assert.equal(changedSnapshot.heading_headingId[0]?.id, secondId);
      assert.notEqual(changedSnapshot.heading_headingId[1]?.id, firstId);
      assert.notEqual(changedSnapshot.heading_headingId[1]?.id, secondId);
    } finally {
      for (let undoCount = 0; editor.document.isDirty && undoCount < 3; undoCount += 1) {
        await vscode.commands.executeCommand("undo");
      }
      assert.equal(editor.document.getText(), originalText);
      await waitForHeadingCount(3);
    }
  });

  test("preserves heading identities across a save event", async (): Promise<void> => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder === undefined) {
      throw new Error("The integration workspace must be open.");
    }
    const documentUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      `.tiered-headings-save-${String(process.pid)}.txt`,
    );
    let document: vscode.TextDocument | undefined;
    try {
      await vscode.workspace.fs.writeFile(documentUri, Buffer.from("@h1 Save test"));
      document = await vscode.workspace.openTextDocument(documentUri);
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      const initialSnapshot = await waitForHeadingCount(1);
      const edited = await editor.edit((builder): void => {
        builder.insert(editor.document.lineAt(0).range.end, " renamed");
      });
      assert.equal(edited, true);
      const editedSnapshot = await waitForNewerModel(initialSnapshot.modelGeneration, 1);
      const headingId = editedSnapshot.heading_headingId[0]?.id;
      assert.notEqual(headingId, undefined);

      assert.equal(await document.save(), true);
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, 300);
      });
      const savedSnapshot = await readActiveSnapshot();

      assert.equal(savedSnapshot?.documentIdentity, documentUri.toString());
      assert.equal(savedSnapshot?.modelGeneration, editedSnapshot.modelGeneration);
      assert.equal(savedSnapshot?.heading_headingId[0]?.id, headingId);
    } finally {
      if (document?.isDirty === true) {
        await document.save();
      }
      if (vscode.window.activeTextEditor?.document === document) {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }
      try {
        await vscode.workspace.fs.delete(documentUri, { useTrash: false });
      } catch {
        // The file may not have been created if setup failed.
      }
      await openSampleDocument();
      await waitForHeadingCount(3);
    }
  });

  test("updates after unsaved edits", async (): Promise<void> => {
    const editor = await openSampleDocument();
    const insertion = "\n// @h2 Live update";
    const inserted = await editor.edit((builder): void => {
      builder.insert(editor.document.positionAt(editor.document.getText().length), insertion);
    });
    assert.equal(inserted, true);

    const { heading_headingId } = await waitForHeadingCount(4);
    assert.equal(heading_headingId[3]?.label, "Live update");

    await vscode.commands.executeCommand("undo");
    await waitForHeadingCount(3);
  });
});
