import assert from "node:assert/strict";

import {
  HeadingDecorationLifecycle,
  type HeadingDecorationId,
  type HeadingDecorationSpecification,
} from "../../src/decorationLifecycle";
import type { Heading, HeadingStyleMap } from "../../src/model";

interface FakeDecoration {
  readonly specification: HeadingDecorationSpecification;
  disposeCount: number;
}

interface DecorationCall {
  readonly decorationId: HeadingDecorationId;
  readonly range_rangeId: readonly string[];
}

interface FakeEditor {
  readonly name: string;
  readonly call_callId: DecorationCall[];
}

interface LifecycleHarness {
  readonly lifecycle: HeadingDecorationLifecycle<FakeEditor, FakeDecoration, string>;
  readonly decorationById: ReadonlyMap<HeadingDecorationId, FakeDecoration>;
}

const decorationId_orderId: readonly HeadingDecorationId[] = [
  "gutterFilledCircle",
  "gutterOpenCircle",
  "gutterPlus",
  "gutterDash",
  "bold",
  "italic",
  "boldItalic",
  "titleBold",
  "titleItalic",
  "titleBoldItalic",
];
const decorationCount = decorationId_orderId.length;

function createHeading(
  id: string,
  level: number,
  line: number,
  startCharacter: number,
  endCharacter: number,
): Heading {
  return {
    id,
    documentIdentity: "document",
    level,
    snippet: "@h",
    matchedSnippet: "@h",
    label: id,
    line,
    startCharacter,
    endCharacter,
    sourceLine: `@h ${id}`,
    titleRanges: [{ startCharacter: 3, endCharacter: 3 + id.length }],
  };
}

function createEditor(name: string): FakeEditor {
  return { name, call_callId: [] };
}

function createHarness(): LifecycleHarness {
  const decorationById = new Map<HeadingDecorationId, FakeDecoration>();
  const lifecycle = new HeadingDecorationLifecycle<FakeEditor, FakeDecoration, string>({
    createDecoration: (specification): FakeDecoration => {
      const decoration: FakeDecoration = { specification, disposeCount: 0 };
      decorationById.set(specification.id, decoration);
      return decoration;
    },
    createTriggerRange: (range): string => (
      `trigger:${String(range.line)}:${String(range.startCharacter)}-${String(range.endCharacter)}`
    ),
    createLineRange: (editor, heading): string => (
      `${editor.name}:line:${String(heading.line)}:${heading.id}`
    ),
    createTitleRange: (heading, range): string => (
      `title:${String(heading.line)}:${String(range.startCharacter)}-${String(range.endCharacter)}`
    ),
    setDecorations: (editor, decoration, range_rangeId): void => {
      editor.call_callId.push({
        decorationId: decoration.specification.id,
        range_rangeId: [...range_rangeId],
      });
    },
    disposeDecoration: (decoration): void => {
      decoration.disposeCount += 1;
    },
  });
  return { lifecycle, decorationById };
}

function getDecoration(
  harness: LifecycleHarness,
  id: HeadingDecorationId,
): FakeDecoration {
  const decoration = harness.decorationById.get(id);
  if (decoration === undefined) {
    throw new Error(`Decoration ${id} was not created.`);
  }
  return decoration;
}

function getCall(editor: FakeEditor, id: HeadingDecorationId): DecorationCall {
  const call = [...editor.call_callId].reverse().find(
    (candidate: DecorationCall): boolean => candidate.decorationId === id,
  );
  if (call === undefined) {
    throw new Error(`Decoration ${id} was not applied to ${editor.name}.`);
  }
  return call;
}

function assertAllDecorationsCleared(call_callId: readonly DecorationCall[]): void {
  assert.deepEqual(
    call_callId.map((call: DecorationCall): HeadingDecorationId => call.decorationId),
    decorationId_orderId,
  );
  call_callId.forEach((call: DecorationCall): void => {
    assert.deepEqual(call.range_rangeId, []);
  });
}

describe("HeadingDecorationLifecycle", (): void => {
  it("creates four gutter decorations with exact base and theme asset paths", (): void => {
    const harness = createHarness();
    const expectedAssetById = new Map<HeadingDecorationId, string>([
      ["gutterFilledCircle", "marker-filled-circle.svg"],
      ["gutterOpenCircle", "marker-open-circle.svg"],
      ["gutterPlus", "marker-plus.svg"],
      ["gutterDash", "marker-dash.svg"],
    ]);

    assert.equal(harness.decorationById.size, decorationCount);
    expectedAssetById.forEach((assetName: string, id: HeadingDecorationId): void => {
      const specification = getDecoration(harness, id).specification;
      assert.equal(specification.kind, "gutter");
      if (specification.kind !== "gutter") {
        return;
      }
      assert.equal(specification.baseAssetPath, `resources/${assetName}`);
      assert.equal(specification.lightAssetPath, `resources/light/${assetName}`);
      assert.equal(specification.darkAssetPath, `resources/dark/${assetName}`);
    });
  });

  it("applies each level category to its corresponding gutter decoration", (): void => {
    const harness = createHarness();
    const editor = createEditor("editor");
    const heading_headingId = [
      createHeading("one", 1, 0, 1, 4),
      createHeading("two", 2, 1, 2, 5),
      createHeading("three", 3, 2, 3, 6),
      createHeading("four", 4, 3, 4, 7),
      createHeading("higher", 8, 4, 5, 8),
    ];

    harness.lifecycle.update(editor, heading_headingId, true, new Map());

    assert.deepEqual(getCall(editor, "gutterFilledCircle").range_rangeId, [
      "trigger:0:1-4",
    ]);
    assert.deepEqual(getCall(editor, "gutterOpenCircle").range_rangeId, [
      "trigger:1:2-5",
    ]);
    assert.deepEqual(getCall(editor, "gutterPlus").range_rangeId, [
      "trigger:2:3-6",
    ]);
    assert.deepEqual(getCall(editor, "gutterDash").range_rangeId, [
      "trigger:3:4-7",
      "trigger:4:5-8",
    ]);
  });

  it("keeps text styles active while every gutter decoration is disabled", (): void => {
    const harness = createHarness();
    const editor = createEditor("editor");
    const heading_headingId = [
      createHeading("bold", 1, 0, 0, 3),
      createHeading("italic", 2, 1, 0, 3),
      createHeading("both", 3, 2, 0, 3),
      createHeading("dash", 4, 3, 0, 3),
    ];
    const styleByLevel: HeadingStyleMap = new Map([
      [1, "bold"],
      [2, "italic"],
      [3, "boldItalic"],
    ]);

    harness.lifecycle.update(editor, heading_headingId, false, styleByLevel);

    const gutterId_idId: readonly HeadingDecorationId[] = [
      "gutterFilledCircle",
      "gutterOpenCircle",
      "gutterPlus",
      "gutterDash",
    ];
    gutterId_idId.forEach((id: HeadingDecorationId): void => {
      assert.deepEqual(getCall(editor, id).range_rangeId, []);
    });
    assert.deepEqual(getCall(editor, "bold").range_rangeId, ["editor:line:0:bold"]);
    assert.deepEqual(getCall(editor, "italic").range_rangeId, [
      "editor:line:1:italic",
    ]);
    assert.deepEqual(getCall(editor, "boldItalic").range_rangeId, [
      "editor:line:2:both",
    ]);
  });

  it("creates separate whole-line and title-only font decorations", (): void => {
    const harness = createHarness();
    const styles = ["bold", "italic", "boldItalic"] as const;
    const titleStyles = ["titleBold", "titleItalic", "titleBoldItalic"] as const;
    styles.forEach((id, index): void => {
      const wholeLine = getDecoration(harness, id).specification;
      const title = getDecoration(harness, titleStyles[index]!).specification;
      assert.equal(wholeLine.kind, "text");
      assert.equal(title.kind, "text");
      if (wholeLine.kind !== "text" || title.kind !== "text") {
        return;
      }
      assert.equal(wholeLine.isWholeLine, true);
      assert.equal(title.isWholeLine, false);
      assert.equal(title.fontWeight, wholeLine.fontWeight);
      assert.equal(title.fontStyle, wholeLine.fontStyle);
    });
  });

  it("applies disjoint title spans by level without changing gutter ranges", (): void => {
    const harness = createHarness();
    const editor = createEditor("editor");
    const heading_headingId: Heading[] = [
      {
        ...createHeading("Alpha Beta", 1, 7, 3, 5),
        sourceLine: "// @h [Alpha] / [Beta]",
        titleRanges: [
          { startCharacter: 7, endCharacter: 12 },
          { startCharacter: 17, endCharacter: 21 },
        ],
      },
      createHeading("italic", 2, 8, 0, 2),
      createHeading("both", 3, 9, 0, 2),
      createHeading("normal", 4, 10, 0, 2),
    ];
    const styleByLevel: HeadingStyleMap = new Map([
      [1, "bold"], [2, "italic"], [3, "boldItalic"],
    ]);
    harness.lifecycle.update(editor, heading_headingId, true, styleByLevel, true);

    assert.deepEqual(getCall(editor, "titleBold").range_rangeId, [
      "title:7:7-12", "title:7:17-21",
    ]);
    assert.deepEqual(getCall(editor, "titleItalic").range_rangeId, ["title:8:3-9"]);
    assert.deepEqual(getCall(editor, "titleBoldItalic").range_rangeId, ["title:9:3-7"]);
    for (const id of ["bold", "italic", "boldItalic"] as const) {
      assert.deepEqual(getCall(editor, id).range_rangeId, []);
    }
    assert.deepEqual(getCall(editor, "gutterFilledCircle").range_rangeId, ["trigger:7:3-5"]);
    assert.deepEqual(getCall(editor, "gutterDash").range_rangeId, ["trigger:10:0-2"]);
  });

  it("clears the inactive font mode when toggling on and off", (): void => {
    const harness = createHarness();
    const editor = createEditor("editor");
    const headings = [createHeading("title", 1, 0, 0, 2)];
    const styleByLevel: HeadingStyleMap = new Map([[1, "bold"]]);
    harness.lifecycle.update(editor, headings, true, styleByLevel);
    assert.deepEqual(getCall(editor, "bold").range_rangeId, ["editor:line:0:title"]);
    assert.deepEqual(getCall(editor, "titleBold").range_rangeId, []);

    harness.lifecycle.update(editor, headings, false, styleByLevel, true);
    assert.deepEqual(getCall(editor, "bold").range_rangeId, []);
    assert.deepEqual(getCall(editor, "titleBold").range_rangeId, ["title:0:3-8"]);
    assert.deepEqual(getCall(editor, "gutterFilledCircle").range_rangeId, []);

    harness.lifecycle.update(editor, headings, true, styleByLevel, false);
    assert.deepEqual(getCall(editor, "bold").range_rangeId, ["editor:line:0:title"]);
    assert.deepEqual(getCall(editor, "titleBold").range_rangeId, []);
  });

  it("leaves generated-only labels unstyled in title mode and respects disabled styles", (): void => {
    const harness = createHarness();
    const editor = createEditor("editor");
    const heading = { ...createHeading("generated", 1, 0, 0, 2), titleRanges: [] };
    harness.lifecycle.update(editor, [heading], true, new Map([[1, "bold"]]), true);
    assert.deepEqual(getCall(editor, "bold").range_rangeId, []);
    assert.deepEqual(getCall(editor, "titleBold").range_rangeId, []);
    assert.deepEqual(getCall(editor, "gutterFilledCircle").range_rangeId, ["trigger:0:0-2"]);

    harness.lifecycle.update(editor, [createHeading("title", 1, 0, 0, 2)], false, new Map(), true);
    assertAllDecorationsCleared(editor.call_callId.slice(-decorationCount));
  });

  it("clears every decoration when switching editors and when cleared", (): void => {
    const harness = createHarness();
    const oldEditor = createEditor("old");
    const newEditor = createEditor("new");
    const heading_headingId = [createHeading("one", 1, 0, 0, 3)];

    harness.lifecycle.update(oldEditor, heading_headingId, true, new Map([[1, "bold"]]), true);
    harness.lifecycle.update(newEditor, heading_headingId, true, new Map());

    const oldClearCall_callId = oldEditor.call_callId.slice(decorationCount);
    assert.equal(oldClearCall_callId.length, decorationCount);
    assertAllDecorationsCleared(oldClearCall_callId);
    assert.equal(newEditor.call_callId.length, decorationCount);

    harness.lifecycle.clear();
    const newClearCall_callId = newEditor.call_callId.slice(decorationCount);
    assert.equal(newClearCall_callId.length, decorationCount);
    assertAllDecorationsCleared(newClearCall_callId);
    harness.lifecycle.clear();
    assert.equal(newEditor.call_callId.length, decorationCount * 2, "clear is idempotent without an editor");
  });

  it("clears an active editor and disposes every decoration exactly once", (): void => {
    const harness = createHarness();
    const editor = createEditor("editor");
    harness.lifecycle.update(
      editor,
      [createHeading("one", 1, 0, 0, 3)],
      true,
      new Map(),
    );

    harness.lifecycle.dispose();

    const clearCall_callId = editor.call_callId.slice(decorationCount);
    assert.equal(clearCall_callId.length, decorationCount);
    assertAllDecorationsCleared(clearCall_callId);
    decorationId_orderId.forEach((id: HeadingDecorationId): void => {
      assert.equal(getDecoration(harness, id).disposeCount, 1);
    });

    harness.lifecycle.dispose();
    assert.equal(editor.call_callId.length, decorationCount * 2);
    decorationId_orderId.forEach((id: HeadingDecorationId): void => {
      assert.equal(getDecoration(harness, id).disposeCount, 1);
    });
  });
});
