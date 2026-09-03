import type { Heading } from "./model";

export interface HeadingIdentity {
  readonly id: string;
  readonly snippet: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface HeadingTextChange {
  readonly rangeOffset: number;
  readonly rangeLength: number;
  readonly textLength: number;
}

export interface ReconciledHeadingResult {
  readonly heading_headingId: Heading[];
  readonly identity_identityId: HeadingIdentity[];
}

interface HeadingOffsets {
  readonly startOffset: number;
  readonly endOffset: number;
}

type HeadingIdAllocator = (heading: Heading) => string;
type HeadingLocator = (heading: Heading) => HeadingOffsets;

function identityKey(startOffset: number, snippet: string): string {
  return JSON.stringify([startOffset, snippet]);
}

/** Moves surviving trigger anchors through a set of document changes. */
export function trackHeadingIdentityChanges(
  identity_identityId: readonly HeadingIdentity[],
  change_changeId: readonly HeadingTextChange[],
): HeadingIdentity[] {
  let trackedIdentity_identityId = [...identity_identityId];
  const orderedChange_changeId = [...change_changeId].sort(
    (left: HeadingTextChange, right: HeadingTextChange): number => (
      right.rangeOffset - left.rangeOffset
    ),
  );

  orderedChange_changeId.forEach((change: HeadingTextChange): void => {
    const changeEnd = change.rangeOffset + change.rangeLength;
    const offsetDelta = change.textLength - change.rangeLength;
    trackedIdentity_identityId = trackedIdentity_identityId.flatMap(
      (identity: HeadingIdentity): HeadingIdentity[] => {
        if (identity.endOffset <= change.rangeOffset) {
          return [identity];
        }
        if (identity.startOffset >= changeEnd) {
          return [{
            ...identity,
            startOffset: identity.startOffset + offsetDelta,
            endOffset: identity.endOffset + offsetDelta,
          }];
        }
        return [];
      },
    );
  });

  return trackedIdentity_identityId;
}

/** Reuses only IDs whose tracked trigger anchors still exist in the new scan. */
export function reconcileHeadingIds(
  previousIdentity_identityId: readonly HeadingIdentity[],
  currentHeading_headingId: readonly Heading[],
  locateHeading: HeadingLocator,
  allocateHeadingId: HeadingIdAllocator,
): ReconciledHeadingResult {
  const previousIdentityByKey = new Map<string, HeadingIdentity>();
  previousIdentity_identityId.forEach((identity: HeadingIdentity): void => {
    previousIdentityByKey.set(identityKey(identity.startOffset, identity.snippet), identity);
  });

  const identity_identityId: HeadingIdentity[] = [];
  const heading_headingId = currentHeading_headingId.map(
    (heading: Heading): Heading => {
      const offsets = locateHeading(heading);
      const previousIdentity = previousIdentityByKey.get(
        identityKey(offsets.startOffset, heading.snippet),
      );
      const id = previousIdentity?.id ?? allocateHeadingId(heading);
      identity_identityId.push({
        id,
        snippet: heading.snippet,
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
      });
      return { ...heading, id };
    },
  );

  return { heading_headingId, identity_identityId };
}
