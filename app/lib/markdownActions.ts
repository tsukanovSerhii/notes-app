/** The text of an editor plus its selection. Pure input and output, no DOM. */
export interface TextSelection {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wraps the selection in `before`/`after`. With nothing selected, inserts the
 * placeholder and selects it so the user can type over it. Applying the same
 * wrap to already-wrapped text removes it again (toggle).
 */
export function wrapSelection(
  { value, selectionStart, selectionEnd }: TextSelection,
  before: string,
  after: string,
  placeholder = ""
): TextSelection {
  const selected = value.slice(selectionStart, selectionEnd);

  const isWrapped =
    selected.length > 0 &&
    value.slice(selectionStart - before.length, selectionStart) === before &&
    value.slice(selectionEnd, selectionEnd + after.length) === after;

  if (isWrapped) {
    return {
      value:
        value.slice(0, selectionStart - before.length) +
        selected +
        value.slice(selectionEnd + after.length),
      selectionStart: selectionStart - before.length,
      selectionEnd: selectionEnd - before.length,
    };
  }

  const inner = selected || placeholder;
  return {
    value:
      value.slice(0, selectionStart) +
      before +
      inner +
      after +
      value.slice(selectionEnd),
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + inner.length,
  };
}

/** Adds a prefix to every line touched by the selection (lists, quotes...). */
export function prefixLines(
  { value, selectionStart, selectionEnd }: TextSelection,
  prefix: string,
  ordered = false
): TextSelection {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  let lineEnd = value.indexOf("\n", selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;

  const transformed = value
    .slice(lineStart, lineEnd)
    .split("\n")
    .map((line, i) => (ordered ? `${i + 1}. ${line}` : `${prefix}${line}`))
    .join("\n");

  return {
    value: value.slice(0, lineStart) + transformed + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + transformed.length,
  };
}

/** Inserts a block on its own line(s), replacing the selection. */
export function insertBlock(
  { value, selectionStart, selectionEnd }: TextSelection,
  text: string
): TextSelection {
  const needsLeadingBreak =
    selectionStart > 0 && value[selectionStart - 1] !== "\n";
  const block = (needsLeadingBreak ? "\n" : "") + text;
  const cursor = selectionStart + block.length;
  return {
    value: value.slice(0, selectionStart) + block + value.slice(selectionEnd),
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

/**
 * Continues a list when Enter is pressed at the end of a list item, and ends
 * the list when Enter is pressed on an empty item. Returns null when the line
 * is not a list item, so the default newline behaviour applies.
 */
export function continueList({
  value,
  selectionStart,
  selectionEnd,
}: TextSelection): TextSelection | null {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const line = value.slice(lineStart, selectionStart);
  const match = /^(\s*)([-*+]|(\d+)\.)\s(\[[ xX]]\s)?/.exec(line);
  if (!match) return null;

  const [marker, indent, bullet, number, task] = match;

  if (line.length === marker.length) {
    return {
      value: value.slice(0, lineStart) + value.slice(selectionStart),
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }

  const nextBullet = number ? `${Number(number) + 1}.` : bullet;
  const insert = `\n${indent}${nextBullet} ${task ? "[ ] " : ""}`;
  const cursor = selectionStart + insert.length;
  return {
    value: value.slice(0, selectionStart) + insert + value.slice(selectionEnd),
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}
