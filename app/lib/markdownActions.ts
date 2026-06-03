export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function wrapSelection(
  el: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder = ""
): EditResult {
  const { value, selectionStart, selectionEnd } = el;
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const next =
    value.slice(0, selectionStart) +
    before +
    selected +
    after +
    value.slice(selectionEnd);

  return {
    value: next,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  };
}

export function prefixLines(
  el: HTMLTextAreaElement,
  prefix: string,
  ordered = false
): EditResult {
  const { value, selectionStart, selectionEnd } = el;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  let lineEnd = value.indexOf("\n", selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd) || "";
  const lines = block.split("\n");
  const transformed = lines
    .map((line, i) => (ordered ? `${i + 1}. ${line}` : `${prefix}${line}`))
    .join("\n");

  const next = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
  return {
    value: next,
    selectionStart: lineStart,
    selectionEnd: lineStart + transformed.length,
  };
}

export function insertBlock(
  el: HTMLTextAreaElement,
  text: string
): EditResult {
  const { value, selectionStart, selectionEnd } = el;
  const next =
    value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  return {
    value: next,
    selectionStart: selectionStart + text.length,
    selectionEnd: selectionStart + text.length,
  };
}
