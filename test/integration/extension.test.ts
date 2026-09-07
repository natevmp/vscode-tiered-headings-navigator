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

interface TreeSelectionItem {
  readonly id: string;
  readonly label: string;
  readonly line: number;
}

const extensionId = "local.tiered-headings-navigator";
const inspectCommand = "_tieredHeadings.getActiveSnapshot";
const inspectTargetsCommand = "_tieredHeadings.getTreeNavigationTargets";
const inspectViewVisibleCommand = "_tieredHeadings.isViewVisible";
const inspectTreeItemsCommand = "_tieredHeadings.getTreeItems";
const inspectFoldingRangesCommand = "_tieredHeadings.getFoldingRanges";
const inspectTreeSelectionCommand = "_tieredHeadings.getTreeSelection";
const focusTreeItemCommand = "_tieredHeadings.focusTreeItem";
const applyNavigatorFoldingStateCommand = "_tieredHeadings.applyNavigatorFoldingState";
const waitForPendingInteractionsCommand = "_tieredHeadings.waitForPendingInteractions";
const pinnedListCommandWaitMilliseconds = 250;
let pinnedListCommandError: Error | undefined;

async function openSampleDocument(): Promise<vscode.TextEditor> {
  return openFixtureDocument("sample.txt");
}

async function openFoldingDemoDocument(): Promise<vscode.TextEditor> {
  return openFixtureDocument("folding-demo.txt");
}

async function openRegexLabelDocument(): Promise<vscode.TextEditor> {
  return openFixtureDocument("regex-label.txt");
}

async function openIndentedDocument(): Promise<vscode.TextEditor> {
  return openFixtureDocument("indented-no-headings.txt");
}

async function openIndentedHeadingDocument(): Promise<vscode.TextEditor> {
  return openFixtureDocument("indented-headings.txt");
}

async function openFixtureDocument(fixtureName: string): Promise<vscode.TextEditor> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder === undefined) {
    throw new Error("The integration workspace must be open.");
  }
  const documentUri = vscode.Uri.joinPath(workspaceFolder.uri, fixtureName);
  const diskText = Buffer.from(await vscode.workspace.fs.readFile(documentUri)).toString(
    "utf8",
  );
  const document = await vscode.workspace.openTextDocument(documentUri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  if (document.isDirty || document.getText() !== diskText) {
    await vscode.commands.executeCommand("workbench.action.files.revert");
    await waitForDocumentReset(document, diskText);
  }
  if (document.isDirty || document.getText() !== diskText) {
    throw new Error(`${fixtureName} could not be restored from its on-disk fixture.`);
  }
  return editor;
}

async function waitForDocumentReset(
  document: vscode.TextDocument,
  diskText: string,
): Promise<void> {
  if (!document.isDirty && document.getText() === diskText) {
    return;
  }
  const documentIdentity = document.uri.toString();
  await new Promise<void>((resolve, reject): void => {
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(
      (event: vscode.TextDocumentChangeEvent): void => {
        if (event.document === document) {
          checkReset();
        }
      },
    );
    const closeDisposable = vscode.workspace.onDidCloseTextDocument(
      (closedDocument: vscode.TextDocument): void => {
        if (closedDocument === document) {
          finish(new Error(
            `${documentIdentity} closed before its fixture reset completed.`,
          ));
        }
      },
    );
    const timeout = setTimeout((): void => {
      finish(new Error(
        `${documentIdentity} fixture reset did not complete before the timeout.`,
      ));
    }, 3000);
    function finish(error?: Error): void {
      changeDisposable.dispose();
      closeDisposable.dispose();
      clearTimeout(timeout);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    }
    function checkReset(): void {
      if (!document.isDirty && document.getText() === diskText) {
        finish();
      }
    }
    checkReset();
  });
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

async function waitForDocumentHeadingCount(
  document: vscode.TextDocument,
  expectedCount: number,
): Promise<ActiveHeadingSnapshot> {
  const documentIdentity = document.uri.toString();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const snapshot = await readActiveSnapshot();
    if (
      snapshot?.documentIdentity === documentIdentity
      && snapshot.heading_headingId.length === expectedCount
    ) {
      return snapshot;
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(
    `The active heading model for ${documentIdentity} did not reach ${expectedCount} headings.`,
  );
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

async function readTreeSelection(): Promise<readonly TreeSelectionItem[]> {
  return vscode.commands.executeCommand<readonly TreeSelectionItem[]>(
    inspectTreeSelectionCommand,
  );
}

async function waitForTreeSelection(expectedLabel: string): Promise<TreeSelectionItem> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const selection_selectionId = await readTreeSelection();
    if (selection_selectionId.length === 1 && selection_selectionId[0]?.label === expectedLabel) {
      return selection_selectionId[0];
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 50);
    });
  }
  const selection_selectionId = await readTreeSelection();
  assert.equal(selection_selectionId.length, 1);
  assert.equal(selection_selectionId[0]?.label, expectedLabel);
  return selection_selectionId[0];
}

function lineIsVisible(editor: vscode.TextEditor, line: number): boolean {
  return editor.visibleRanges.some((range: vscode.Range): boolean => (
    range.start.line <= line && range.end.line >= line
  ));
}

async function waitForLineVisibility(
  editor: vscode.TextEditor,
  line: number,
  expectedVisibility: boolean,
): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (lineIsVisible(editor, line) === expectedVisibility) {
      return;
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 50);
    });
  }
  assert.equal(lineIsVisible(editor, line), expectedVisibility);
}

async function executePinnedListCommand(command: "list.collapse" | "list.expand"): Promise<void> {
  const operation = vscode.commands.executeCommand(command).then(
    (): void => {},
    (error: unknown): void => {
      pinnedListCommandError = error instanceof Error ? error : new Error(String(error));
    },
  );
  await Promise.race([
    operation,
    new Promise<void>((resolve): void => {
      setTimeout(resolve, pinnedListCommandWaitMilliseconds);
    }),
  ]);
  throwPinnedListCommandError();
}

function throwPinnedListCommandError(): void {
  if (pinnedListCommandError === undefined) {
    return;
  }
  const error = pinnedListCommandError;
  pinnedListCommandError = undefined;
  throw error;
}

type FoldingLineRange = readonly [startLine: number, endLine: number];
const foldingRangeCommand = "vscode.executeFoldingRangeProvider";
let foldingRangeCommandAvailable: boolean | undefined;

async function readFoldingRanges(
  document: vscode.TextDocument,
): Promise<readonly vscode.FoldingRange[]> {
  const publicCommandAvailable = await foldingRangeCommandIsAvailable();
  if (!publicCommandAvailable && !/^1\.75\./.test(vscode.version)) {
    throw new Error(
      `${foldingRangeCommand} is unexpectedly unavailable in VS Code ${vscode.version}.`,
    );
  }
  const command = publicCommandAvailable
    ? foldingRangeCommand
    : inspectFoldingRangesCommand;
  return await vscode.commands.executeCommand<vscode.FoldingRange[] | undefined>(
    command,
    document.uri,
  ) ?? [];
}

async function readCustomFoldingRanges(
  document: vscode.TextDocument,
): Promise<readonly vscode.FoldingRange[] | undefined> {
  return vscode.commands.executeCommand<vscode.FoldingRange[] | undefined>(
    inspectFoldingRangesCommand,
    document.uri,
  );
}

async function foldingRangeCommandIsAvailable(): Promise<boolean> {
  if (foldingRangeCommandAvailable !== undefined) {
    return foldingRangeCommandAvailable;
  }
  const document = vscode.window.activeTextEditor?.document;
  if (document === undefined) {
    throw new Error("An active document is required to probe the folding provider command.");
  }
  try {
    await vscode.commands.executeCommand(foldingRangeCommand, document.uri);
    foldingRangeCommandAvailable = true;
  } catch (error) {
    if (!String(error).includes(`command '${foldingRangeCommand}' not found`)) {
      throw error;
    }
    foldingRangeCommandAvailable = false;
  }
  return foldingRangeCommandAvailable;
}

function assertFoldingRanges(
  foldingRange_rangeId: readonly vscode.FoldingRange[],
  expectedRange_rangeId: readonly FoldingLineRange[],
): void {
  assert.deepEqual(
    foldingRange_rangeId.map((range): FoldingLineRange => [range.start, range.end]),
    expectedRange_rangeId,
  );
  foldingRange_rangeId.forEach((range: vscode.FoldingRange): void => {
    assert.equal(range.kind, undefined);
  });
}

function expectedFoldingDemoRanges(document: vscode.TextDocument): FoldingLineRange[] {
  return [
    [0, 9],
    [2, 6],
    [4, 6],
    [7, 9],
    [10, document.lineCount - 1],
  ];
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

  suiteTeardown(async (): Promise<void> => {
    await openSampleDocument();
    throwPinnedListCommandError();
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

  test("applies a configured label regex in the active tree snapshot", async (): Promise<void> => {
    assert.equal(vscode.workspace.isTrusted, true, "the integration workspace must be trusted");
    await openRegexLabelDocument();
    await vscode.commands.executeCommand("tieredHeadings.refresh");

    const { heading_headingId } = await waitForHeadingCount(1);
    assert.equal(heading_headingId[0]?.label, "This is the title");
    assert.equal(heading_headingId[0]?.line, 0);
    assert.equal(heading_headingId[0]?.startCharacter, 3);
    assert.equal(heading_headingId[0]?.endCharacter, 6);

    await openSampleDocument();
    await waitForHeadingCount(3);
  });

  test("provides native plaintext folding ranges by default", async (): Promise<void> => {
    const { document } = await openFoldingDemoDocument();
    assert.equal(
      vscode.workspace.getConfiguration("tieredHeadings", document.uri).get(
        "folding.enabled",
      ),
      true,
    );

    assertFoldingRanges(
      await readFoldingRanges(document),
      expectedFoldingDemoRanges(document),
    );
  });

  test(
    "disables and re-enables native folding through resource settings",
    async (): Promise<void> => {
      const { document } = await openFoldingDemoDocument();
      const configuration = vscode.workspace.getConfiguration(
        "tieredHeadings",
        document.uri,
      );
      const previousValue = configuration.inspect<boolean>(
        "folding.enabled",
      )?.workspaceFolderValue;

      try {
        await configuration.update(
          "folding.enabled",
          false,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
        assert.equal(await readCustomFoldingRanges(document), undefined);
        if (await foldingRangeCommandIsAvailable()) {
          assert.deepEqual(await readFoldingRanges(document), []);
        }

        await configuration.update(
          "folding.enabled",
          true,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
        assertFoldingRanges(
          await readFoldingRanges(document),
          expectedFoldingDemoRanges(document),
        );
      } finally {
        await configuration.update(
          "folding.enabled",
          previousValue,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
      }
    },
  );

  test("preserves native indentation fallback when no custom range exists", async (): Promise<void> => {
    const { document } = await openIndentedDocument();

    assert.equal(await readCustomFoldingRanges(document), undefined);
    if (await foldingRangeCommandIsAvailable()) {
      assertFoldingRanges(await readFoldingRanges(document), [
        [0, 3],
        [1, 2],
      ]);
    } else {
      assert.match(vscode.version, /^1\.75\./);
    }
  });

  test("updates folding ranges from unsaved document text", async (): Promise<void> => {
    const editor = await openFoldingDemoDocument();
    const { document } = editor;
    const addedHeadingLine = document.lineCount;
    const originalRange_rangeId = expectedFoldingDemoRanges(document);

    try {
      const inserted = await editor.edit((builder): void => {
        builder.insert(
          document.positionAt(document.getText().length),
          "\n// @h1 Zeta\nZeta body.",
        );
      });
      assert.equal(inserted, true);
      assert.equal(document.isDirty, true);

      assertFoldingRanges(await readFoldingRanges(document), [
        ...originalRange_rangeId,
        [addedHeadingLine, document.lineCount - 1],
      ]);
    } finally {
      await openFoldingDemoDocument();
    }
  });

  test(
    "provides folding ranges for multiple open plaintext documents",
    async (): Promise<void> => {
      const foldingDocument = (await openFoldingDemoDocument()).document;
      const sampleDocument = (await openSampleDocument()).document;
      assert.notEqual(vscode.window.activeTextEditor?.document, foldingDocument);

      assertFoldingRanges(
        await readFoldingRanges(foldingDocument),
        expectedFoldingDemoRanges(foldingDocument),
      );

      const sampleEndLine = sampleDocument.lineCount - 1;
      const expectedSampleRange_rangeId: FoldingLineRange[] = [
        [0, sampleEndLine],
        [2, sampleEndLine],
      ];
      if (sampleEndLine > 4) {
        expectedSampleRange_rangeId.push([4, sampleEndLine]);
      }
      assertFoldingRanges(
        await readFoldingRanges(sampleDocument),
        expectedSampleRange_rangeId,
      );
    },
  );

  test("shows and focuses the Headings view", async (): Promise<void> => {
    await vscode.commands.executeCommand("tieredHeadings.showHeadings");
    await waitForViewVisibility(true);
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await waitForViewVisibility(false);

    await vscode.commands.executeCommand("tieredHeadings.showHeadings");

    await waitForViewVisibility(true);
  });

  test("selects the heading section containing the primary cursor", async (): Promise<void> => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder === undefined) {
      throw new Error("The integration workspace must be open.");
    }
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceFolder.uri, "hierarchy-demo.txt"),
    );
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    await waitForHeadingCount(8);
    await vscode.commands.executeCommand("tieredHeadings.showHeadings");
    await waitForViewVisibility(true);

    const expectation_expectationId: readonly [number, string][] = [
      [2, "A"],
      [6, "B"],
      [10, "C"],
      [18, "E"],
      [22, "F"],
      [26, "G"],
      [30, "H"],
    ];
    for (const [line, label] of expectation_expectationId) {
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      const selectedHeading = await waitForTreeSelection(label);
      assert.equal(selectedHeading.line <= line, true);
      assert.equal(vscode.window.activeTextEditor, editor);
    }

    const primaryPosition = new vscode.Position(6, 0);
    const secondaryPosition = new vscode.Position(30, 0);
    editor.selections = [
      new vscode.Selection(primaryPosition, primaryPosition),
      new vscode.Selection(secondaryPosition, secondaryPosition),
    ];
    await waitForTreeSelection("B");

    await openSampleDocument();
    await waitForHeadingCount(3);
  });

  test("does not open a hidden view and catches up when it becomes visible", async (): Promise<void> => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder === undefined) {
      throw new Error("The integration workspace must be open.");
    }
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceFolder.uri, "hierarchy-demo.txt"),
    );
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    await waitForHeadingCount(8);
    await vscode.commands.executeCommand("tieredHeadings.showHeadings");
    await waitForViewVisibility(true);

    const lastPosition = new vscode.Position(30, 0);
    editor.selection = new vscode.Selection(lastPosition, lastPosition);
    await waitForTreeSelection("H");
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await waitForViewVisibility(false);

    const hiddenPosition = new vscode.Position(6, 0);
    editor.selection = new vscode.Selection(hiddenPosition, hiddenPosition);
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 100);
    });
    assert.equal(
      await vscode.commands.executeCommand<boolean>(inspectViewVisibleCommand),
      false,
    );

    await vscode.commands.executeCommand("tieredHeadings.showHeadings");
    await waitForViewVisibility(true);
    await waitForTreeSelection("B");

    await openSampleDocument();
    await waitForHeadingCount(3);
  });

  test("synchronizes navigator parent folding to the editor when enabled", async (): Promise<void> => {
    const editor = await openFoldingDemoDocument();
    const { document } = editor;
    await waitForHeadingCount(5);
    const configuration = vscode.workspace.getConfiguration(
      "tieredHeadings",
      document.uri,
    );
    const previousSyncValue = configuration.inspect<boolean>(
      "folding.syncFromNavigator",
    )?.workspaceFolderValue;

    try {
      await vscode.commands.executeCommand("editor.unfoldAll");
      editor.revealRange(document.lineAt(0).range, vscode.TextEditorRevealType.AtTop);
      await waitForLineVisibility(editor, 3, true);

      const initialSnapshot = await waitForHeadingCount(5);
      const beta = initialSnapshot.heading_headingId.find(
        (heading): boolean => heading.label === "Beta",
      );
      const gamma = initialSnapshot.heading_headingId.find(
        (heading): boolean => heading.label === "Gamma",
      );
      const alpha = initialSnapshot.heading_headingId.find(
        (heading): boolean => heading.label === "Alpha",
      );
      if (alpha === undefined || beta === undefined || gamma === undefined) {
        throw new Error("Expected Alpha, Beta, and Gamma headings in folding-demo.txt.");
      }

      assert.equal(configuration.get("folding.syncFromNavigator"), false);
      const gammaBodyPosition = new vscode.Position(gamma.line + 1, 0);
      editor.selection = new vscode.Selection(gammaBodyPosition, gammaBodyPosition);
      await waitForTreeSelection("Gamma");
      assert.equal(
        await vscode.commands.executeCommand<boolean>(focusTreeItemCommand, beta.id),
        true,
      );
      await executePinnedListCommand("list.collapse");
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      assert.equal(lineIsVisible(editor, beta.line + 1), true);

      const laterGammaPosition = new vscode.Position(gamma.line + 2, 0);
      editor.selection = new vscode.Selection(laterGammaPosition, laterGammaPosition);
      await waitForTreeSelection("Gamma");

      assert.equal(
        await vscode.commands.executeCommand<boolean>(
          applyNavigatorFoldingStateCommand,
          beta.id,
          false,
        ),
        true,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      assert.equal(lineIsVisible(editor, 3), true);

      await configuration.update(
        "folding.syncFromNavigator",
        true,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
      await vscode.commands.executeCommand("tieredHeadings.refresh");
      const enabledSnapshot = await waitForHeadingCount(5);
      const enabledHeadingByLabel = new Map(
        enabledSnapshot.heading_headingId.map((heading): [string, HeadingSnapshot] => [
          heading.label,
          heading,
        ]),
      );
      const enabledAlpha = enabledHeadingByLabel.get("Alpha");
      const enabledBeta = enabledHeadingByLabel.get("Beta");
      const enabledGamma = enabledHeadingByLabel.get("Gamma");
      if (enabledAlpha === undefined || enabledBeta === undefined || enabledGamma === undefined) {
        throw new Error("Expected refreshed folding headings.");
      }

      await vscode.commands.executeCommand(
        applyNavigatorFoldingStateCommand,
        enabledBeta.id,
        false,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      await waitForLineVisibility(editor, 3, false);
      assert.equal(lineIsVisible(editor, 7), true);

      await vscode.commands.executeCommand(
        applyNavigatorFoldingStateCommand,
        enabledBeta.id,
        false,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      assert.equal(lineIsVisible(editor, 7), true);

      await vscode.commands.executeCommand(
        applyNavigatorFoldingStateCommand,
        enabledBeta.id,
        true,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      await waitForLineVisibility(editor, 3, true);

      await vscode.commands.executeCommand(
        applyNavigatorFoldingStateCommand,
        enabledGamma.id,
        false,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      assert.equal(lineIsVisible(editor, 5), true);

      const alphaPosition = new vscode.Position(enabledAlpha.line, 0);
      editor.selection = new vscode.Selection(alphaPosition, alphaPosition);
      await waitForTreeSelection("Alpha");
      await vscode.commands.executeCommand("tieredHeadings.showHeadings");
      assert.equal(
        await vscode.commands.executeCommand<boolean>(focusTreeItemCommand, enabledAlpha.id),
        true,
      );

      // These pinned workbench commands exercise the real TreeView event path.
      await executePinnedListCommand("list.collapse");
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      await waitForLineVisibility(editor, 1, false);
      throwPinnedListCommandError();

      await executePinnedListCommand("list.expand");
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      await waitForLineVisibility(editor, 1, true);
      throwPinnedListCommandError();
    } finally {
      await vscode.commands.executeCommand("editor.unfoldAll");
      await configuration.update(
        "folding.syncFromNavigator",
        previousSyncValue,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
      await openSampleDocument();
      await waitForHeadingCount(3);
    }
  });

  test("honors custom and language-scoped editor folding gates", async (): Promise<void> => {
    const editor = await openIndentedHeadingDocument();
    const { document } = editor;
    await vscode.commands.executeCommand("tieredHeadings.refresh");
    await waitForDocumentHeadingCount(document, 3);
    const headingConfiguration = vscode.workspace.getConfiguration(
      "tieredHeadings",
      document.uri,
    );
    const editorConfiguration = vscode.workspace.getConfiguration("editor", {
      uri: document.uri,
      languageId: document.languageId,
    });
    const readEditorConfiguration = (): vscode.WorkspaceConfiguration => (
      vscode.workspace.getConfiguration("editor", {
        uri: document.uri,
        languageId: document.languageId,
      })
    );
    const previousSyncValue = headingConfiguration.inspect<boolean>(
      "folding.syncFromNavigator",
    )?.workspaceFolderValue;
    const previousFoldingEnabledValue = headingConfiguration.inspect<boolean>(
      "folding.enabled",
    )?.workspaceFolderValue;
    const previousEditorFoldingValue = editorConfiguration.inspect<boolean>(
      "folding",
    )?.workspaceFolderLanguageValue;
    const previousFoldingStrategyValue = editorConfiguration.inspect<string>(
      "foldingStrategy",
    )?.workspaceFolderLanguageValue;

    try {
      await vscode.commands.executeCommand("editor.unfoldAll");
      editor.revealRange(document.lineAt(0).range, vscode.TextEditorRevealType.AtTop);
      await waitForLineVisibility(editor, 1, true);
      await headingConfiguration.update(
        "folding.syncFromNavigator",
        true,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
      await headingConfiguration.update(
        "folding.enabled",
        false,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
      await vscode.commands.executeCommand("tieredHeadings.refresh");
      let snapshot = await waitForDocumentHeadingCount(document, 3);
      let alpha = snapshot.heading_headingId.find(
        (heading): boolean => heading.label === "Alpha",
      );
      if (alpha === undefined) {
        throw new Error("Expected Alpha in indented-headings.txt.");
      }

      await vscode.commands.executeCommand(
        applyNavigatorFoldingStateCommand,
        alpha.id,
        false,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      assert.equal(lineIsVisible(editor, 1), true);

      await headingConfiguration.update(
        "folding.enabled",
        true,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
      await editorConfiguration.update(
        "folding",
        false,
        vscode.ConfigurationTarget.WorkspaceFolder,
        true,
      );
      assert.equal(
        readEditorConfiguration().get("folding"),
        false,
      );
      await vscode.commands.executeCommand("tieredHeadings.refresh");
      snapshot = await waitForDocumentHeadingCount(document, 3);
      alpha = snapshot.heading_headingId.find(
        (heading): boolean => heading.label === "Alpha",
      );
      if (alpha === undefined) {
        throw new Error("Expected refreshed Alpha heading.");
      }

      await vscode.commands.executeCommand(
        applyNavigatorFoldingStateCommand,
        alpha.id,
        false,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      assert.equal(lineIsVisible(editor, 1), true);

      await editorConfiguration.update(
        "folding",
        true,
        vscode.ConfigurationTarget.WorkspaceFolder,
        true,
      );
      await editorConfiguration.update(
        "foldingStrategy",
        "indentation",
        vscode.ConfigurationTarget.WorkspaceFolder,
        true,
      );
      assert.equal(readEditorConfiguration().get("folding"), true);
      assert.equal(readEditorConfiguration().get("foldingStrategy"), "indentation");
      await vscode.commands.executeCommand("editor.unfoldAll");

      await vscode.commands.executeCommand(
        applyNavigatorFoldingStateCommand,
        alpha.id,
        false,
      );
      await vscode.commands.executeCommand(waitForPendingInteractionsCommand);
      assert.equal(lineIsVisible(editor, 1), true);

      // Prove that an unguarded fold command would act on the indentation range.
      await vscode.commands.executeCommand("editor.fold", {
        direction: "down",
        levels: 1,
        selectionLines: [alpha.line],
      });
      await waitForLineVisibility(editor, 1, false);
    } finally {
      await vscode.commands.executeCommand("editor.unfoldAll");
      await editorConfiguration.update(
        "folding",
        previousEditorFoldingValue,
        vscode.ConfigurationTarget.WorkspaceFolder,
        true,
      );
      await editorConfiguration.update(
        "foldingStrategy",
        previousFoldingStrategyValue,
        vscode.ConfigurationTarget.WorkspaceFolder,
        true,
      );
      await headingConfiguration.update(
        "folding.enabled",
        previousFoldingEnabledValue,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
      await headingConfiguration.update(
        "folding.syncFromNavigator",
        previousSyncValue,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
      const sampleEditor = await openSampleDocument();
      await waitForDocumentHeadingCount(sampleEditor.document, 3);
    }
  });

  test("uses level symbols and accessible line-only descriptions", async (): Promise<void> => {
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
    type ExpectedPaneIcon =
      | { readonly kind: "theme"; readonly iconId: string }
      | { readonly kind: "asset"; readonly assetName: string };
    interface ExpectedPresentation {
      readonly icon: ExpectedPaneIcon;
      readonly level: number;
      readonly lineNumber: number;
    }
    const expectedPresentationByLabel = new Map<string, ExpectedPresentation>([
      ["A", {
        icon: { kind: "theme", iconId: "circle-filled" },
        level: 1,
        lineNumber: 1,
      }],
      ["B", {
        icon: { kind: "theme", iconId: "circle-outline" },
        level: 2,
        lineNumber: 5,
      }],
      ["E", {
        icon: { kind: "asset", assetName: "marker-plus.svg" },
        level: 3,
        lineNumber: 17,
      }],
      ["H", {
        icon: { kind: "theme", iconId: "dash" },
        level: 4,
        lineNumber: 29,
      }],
    ]);

    expectedPresentationByLabel.forEach((expected, label: string): void => {
      const item = item_itemId.find(
        (candidate: vscode.TreeItem): boolean => candidate.label === label,
      );
      if (item === undefined) {
        throw new Error(`Tree item ${label} was not found.`);
      }
      if (expected.icon.kind === "theme") {
        const iconPath = item.iconPath as vscode.ThemeIcon | undefined;
        assert.equal(iconPath?.id, expected.icon.iconId);
      } else {
        const iconPath = item.iconPath as { light: vscode.Uri; dark: vscode.Uri } | undefined;
        assert.equal(
          iconPath?.light.path.endsWith(`/resources/light/${expected.icon.assetName}`),
          true,
        );
        assert.equal(
          iconPath?.dark.path.endsWith(`/resources/dark/${expected.icon.assetName}`),
          true,
        );
      }
      assert.equal(item.description, `line ${String(expected.lineNumber)}`);
      assert.equal(
        item.accessibilityInformation?.label,
        `${label}, level ${String(expected.level)}, line ${String(expected.lineNumber)}`,
      );
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
    try {
      const inserted = await editor.edit((builder): void => {
        builder.insert(new vscode.Position(0, 0), "ordinary line\n");
      });
      assert.equal(inserted, true);
      const selectionAfterEdit = editor.selection.active;

      await vscode.commands.executeCommand("tieredHeadings.navigate", staleTarget);

      assert.equal(editor.selection.active.line, selectionAfterEdit.line);
      assert.equal(editor.selection.active.character, selectionAfterEdit.character);
    } finally {
      await openSampleDocument();
      await waitForHeadingCount(3);
    }
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
      await openSampleDocument();
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
      assert.equal(document.isDirty, false);
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
    try {
      const inserted = await editor.edit((builder): void => {
        builder.insert(editor.document.positionAt(editor.document.getText().length), insertion);
      });
      assert.equal(inserted, true);

      const { heading_headingId } = await waitForHeadingCount(4);
      assert.equal(heading_headingId[3]?.label, "Live update");
    } finally {
      await openSampleDocument();
      await waitForHeadingCount(3);
    }
  });
});
