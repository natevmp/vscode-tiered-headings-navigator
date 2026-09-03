import assert from "node:assert/strict";

import {
  reconcileHeadingIds,
  trackHeadingIdentityChanges,
  type HeadingIdentity,
  type HeadingTextChange,
  type ReconciledHeadingResult,
} from "../../src/headingIdentity";
import type { Heading, TriggerDefinition } from "../../src/model";
import { scanDocument } from "../../src/scanner";

const trigger: TriggerDefinition = {
  snippet: "@h1",
  level: 1,
  labelTemplate: "${after}",
};

function createAllocator(): (heading: Heading) => string {
  let nextId = 0;
  return (): string => {
    nextId += 1;
    return `runtime-${nextId}`;
  };
}

function getLineOffsets(documentText: string): number[] {
  const offset_lineId = [0];
  const lineEndingPattern = /\r\n|\n|\r/g;
  let match = lineEndingPattern.exec(documentText);
  while (match !== null) {
    offset_lineId.push(match.index + match[0].length);
    match = lineEndingPattern.exec(documentText);
  }
  return offset_lineId;
}

function reconcileText(
  documentText: string,
  identity_identityId: readonly HeadingIdentity[],
  allocateHeadingId: (heading: Heading) => string,
): ReconciledHeadingResult {
  const offset_lineId = getLineOffsets(documentText);
  return reconcileHeadingIds(
    identity_identityId,
    scanDocument(documentText, "document", [trigger], true),
    (heading: Heading) => {
      const lineOffset = offset_lineId[heading.line];
      if (lineOffset === undefined) {
        throw new Error(`Missing offset for line ${heading.line}.`);
      }
      return {
        startOffset: lineOffset + heading.startCharacter,
        endOffset: lineOffset + heading.endCharacter,
      };
    },
    allocateHeadingId,
  );
}

describe("heading identity tracking", (): void => {
  it("preserves existing IDs when a same-trigger heading is inserted or deleted", (): void => {
    const allocateHeadingId = createAllocator();
    const original = reconcileText("@h1 Alpha\n@h1 Beta", [], allocateHeadingId);
    const insertion: HeadingTextChange = {
      rangeOffset: 0,
      rangeLength: 0,
      textLength: "@h1 New\n".length,
    };
    const insertedIdentities = trackHeadingIdentityChanges(
      original.identity_identityId,
      [insertion],
    );
    const inserted = reconcileText(
      "@h1 New\n@h1 Alpha\n@h1 Beta",
      insertedIdentities,
      allocateHeadingId,
    );

    assert.notEqual(inserted.heading_headingId[0]?.id, original.heading_headingId[0]?.id);
    assert.equal(inserted.heading_headingId[1]?.id, original.heading_headingId[0]?.id);
    assert.equal(inserted.heading_headingId[2]?.id, original.heading_headingId[1]?.id);

    const deletion: HeadingTextChange = {
      rangeOffset: 0,
      rangeLength: "@h1 New\n".length,
      textLength: 0,
    };
    const deletedIdentities = trackHeadingIdentityChanges(
      inserted.identity_identityId,
      [deletion],
    );
    const deleted = reconcileText(
      "@h1 Alpha\n@h1 Beta",
      deletedIdentities,
      allocateHeadingId,
    );
    assert.equal(deleted.heading_headingId[0]?.id, original.heading_headingId[0]?.id);
    assert.equal(deleted.heading_headingId[1]?.id, original.heading_headingId[1]?.id);
  });

  it("preserves an ID when only the label text is renamed", (): void => {
    const allocateHeadingId = createAllocator();
    const originalText = "@h1 Alpha";
    const original = reconcileText(originalText, [], allocateHeadingId);
    const renamedIdentities = trackHeadingIdentityChanges(
      original.identity_identityId,
      [{ rangeOffset: 4, rangeLength: 5, textLength: "Renamed".length }],
    );
    const renamed = reconcileText("@h1 Renamed", renamedIdentities, allocateHeadingId);

    assert.equal(renamed.heading_headingId[0]?.id, original.heading_headingId[0]?.id);
  });

  it("tracks the survivor when identical text is deleted and appended", (): void => {
    const allocateHeadingId = createAllocator();
    const documentText = "@h1 Same\n@h1 Same";
    const original = reconcileText(documentText, [], allocateHeadingId);
    const changedIdentities = trackHeadingIdentityChanges(
      original.identity_identityId,
      [
        { rangeOffset: documentText.length, rangeLength: 0, textLength: "\n@h1 Same".length },
        { rangeOffset: 0, rangeLength: "@h1 Same\n".length, textLength: 0 },
      ],
    );
    const changed = reconcileText(documentText, changedIdentities, allocateHeadingId);

    assert.equal(changed.heading_headingId[0]?.id, original.heading_headingId[1]?.id);
    assert.notEqual(changed.heading_headingId[1]?.id, original.heading_headingId[0]?.id);
    assert.notEqual(changed.heading_headingId[1]?.id, original.heading_headingId[1]?.id);
  });

  it("drops an identity when a change overlaps its trigger", (): void => {
    const allocateHeadingId = createAllocator();
    const original = reconcileText("@h1 Alpha", [], allocateHeadingId);
    const changedIdentities = trackHeadingIdentityChanges(
      original.identity_identityId,
      [{ rangeOffset: 1, rangeLength: 1, textLength: 1 }],
    );

    assert.deepEqual(changedIdentities, []);
  });
});
