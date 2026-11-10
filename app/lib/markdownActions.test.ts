import { expect, test } from "@playwright/test";
import {
  continueList,
  insertBlock,
  prefixLines,
  wrapSelection,
  type TextSelection,
} from "@/app/lib/markdownActions";

/** Builds a selection from a string where `«` and `»` mark the selection. */
function sel(marked: string): TextSelection {
  const start = marked.indexOf("«");
  const end = marked.indexOf("»") - 1;
  return {
    value: marked.replace("«", "").replace("»", ""),
    selectionStart: start,
    selectionEnd: end,
  };
}

/** Renders a selection back into the `«` `»` notation for readable asserts. */
function show({ value, selectionStart, selectionEnd }: TextSelection): string {
  return (
    value.slice(0, selectionStart) +
    "«" +
    value.slice(selectionStart, selectionEnd) +
    "»" +
    value.slice(selectionEnd)
  );
}

test.describe("wrapSelection", () => {
  test("wraps the selected text and keeps it selected", () => {
    expect(show(wrapSelection(sel("hello «world»"), "**", "**"))).toBe("hello **«world»**");
  });

  test("inserts and selects the placeholder when nothing is selected", () => {
    expect(show(wrapSelection(sel("a «»b"), "*", "*", "italic"))).toBe("a *«italic»*b");
  });

  test("unwraps text that is already wrapped (toggle)", () => {
    expect(show(wrapSelection(sel("**«bold»**"), "**", "**"))).toBe("«bold»");
  });
});

test.describe("prefixLines", () => {
  test("prefixes every selected line", () => {
    expect(prefixLines(sel("«a\nb\nc»"), "- ").value).toBe("- a\n- b\n- c");
  });

  test("prefixes the whole current line from a caret", () => {
    expect(prefixLines(sel("one\ntw«»o\nthree"), "> ").value).toBe("one\n> two\nthree");
  });

  test("numbers lines for ordered lists", () => {
    expect(prefixLines(sel("«x\ny»"), "", true).value).toBe("1. x\n2. y");
  });
});

test.describe("insertBlock", () => {
  test("starts the block on a new line when the caret is mid-line", () => {
    expect(show(insertBlock(sel("text«»"), "---\n"))).toBe("text\n---\n«»");
  });

  test("does not add a blank line at the start of the document", () => {
    expect(insertBlock(sel("«»"), "---\n").value).toBe("---\n");
  });
});

test.describe("continueList", () => {
  test("continues a bullet list", () => {
    expect(show(continueList(sel("- milk«»"))!)).toBe("- milk\n- «»");
  });

  test("increments numbered lists", () => {
    expect(show(continueList(sel("1. one«»"))!)).toBe("1. one\n2. «»");
  });

  test("continues task lists with an unchecked box", () => {
    expect(show(continueList(sel("- [x] done«»"))!)).toBe("- [x] done\n- [ ] «»");
  });

  test("keeps indentation", () => {
    expect(continueList(sel("  - nested«»"))!.value).toBe("  - nested\n  - ");
  });

  test("ends the list on an empty item", () => {
    expect(show(continueList(sel("- a\n- «»"))!)).toBe("- a\n«»");
  });

  test("returns null outside of lists", () => {
    expect(continueList(sel("plain text«»"))).toBeNull();
  });
});
