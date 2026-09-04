/**
 * Returns the rightmost source-ordered item at or before a zero-based cursor
 * line, or undefined when no item precedes it. The input must be ordered by
 * ascending line number. Runs in O(log H) time without mutating the input.
 */
export function findCurrentHeading<T extends { readonly line: number }>(
  item_itemId: readonly T[],
  cursorLine: number,
): T | undefined {
  let firstFollowingIndex = 0;
  let searchEndIndex = item_itemId.length;

  while (firstFollowingIndex < searchEndIndex) {
    const middleIndex = firstFollowingIndex
      + Math.floor((searchEndIndex - firstFollowingIndex) / 2);
    if (item_itemId[middleIndex]!.line <= cursorLine) {
      firstFollowingIndex = middleIndex + 1;
    } else {
      searchEndIndex = middleIndex;
    }
  }

  return item_itemId[firstFollowingIndex - 1];
}
