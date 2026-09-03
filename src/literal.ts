function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Creates a safe regular expression that still treats the snippet as literal text. */
export function createLiteralExpression(
  snippet: string,
  caseSensitive: boolean,
  wholeString = false,
): RegExp {
  const escapedSnippet = escapeRegExp(snippet);
  const source = wholeString ? `^(?:${escapedSnippet})$` : escapedSnippet;
  return new RegExp(source, caseSensitive ? "u" : "iu");
}

/** Compares snippets using exactly the same case rules as document matching. */
export function literalSnippetsEqual(
  left: string,
  right: string,
  caseSensitive: boolean,
): boolean {
  if (caseSensitive) {
    return left === right;
  }
  return createLiteralExpression(left, false, true).test(right)
    && createLiteralExpression(right, false, true).test(left);
}
