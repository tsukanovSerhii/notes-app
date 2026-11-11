import { expect, test } from "@playwright/test";
import { highlight, type TokenType } from "@/features/markdown/lib/highlight";

const typesOf = (code: string, lang: string) =>
  highlight(code, lang)
    .filter((t) => t.type !== "plain")
    .map((t) => [t.type, t.text] as [TokenType, string]);

test("round-trips the source text exactly", () => {
  const code = "const a = `x ${y}`; // hi\nfunction f() { return 1.5e3; }";
  expect(highlight(code, "ts").map((t) => t.text).join("")).toBe(code);
});

test("TypeScript tokens", () => {
  expect(typesOf('const greet = (name: string) => "hi"; // done', "ts")).toEqual([
    ["keyword", "const"],
    ["operator", "="],
    ["operator", ":"],
    ["operator", "=>"],
    ["string", '"hi"'],
    ["comment", "// done"],
  ]);
  expect(typesOf("new Map<string>(); format(x)", "js")).toEqual([
    ["keyword", "new"],
    ["type", "Map"],
    ["operator", "<"],
    ["operator", ">"],
    ["function", "format"],
  ]);
});

test("keywords are not matched inside identifiers", () => {
  expect(typesOf("formatting iffy", "js")).toEqual([]);
});

test("JSON separates keys from string values", () => {
  const tokens = typesOf('{"a": "b", "n": 1, "ok": true}', "json");
  expect(tokens).toEqual([
    ["property", '"a"'],
    ["string", '"b"'],
    ["property", '"n"'],
    ["number", "1"],
    ["property", '"ok"'],
    ["literal", "true"],
  ]);
});

test("Python and bash", () => {
  expect(typesOf("def hello(): return None # x", "python")).toEqual([
    ["keyword", "def"],
    ["function", "hello"],
    ["keyword", "return"],
    ["literal", "None"],
    ["comment", "# x"],
  ]);
  expect(typesOf('echo "$HOME" --verbose', "bash")).toEqual([
    ["function", "echo"],
    ["string", '"$HOME"'],
    ["attr", "--verbose"],
  ]);
});

test("unknown languages and very large inputs stay plain", () => {
  expect(highlight("x = 1", "brainfuck")).toEqual([{ type: "plain", text: "x = 1" }]);
  const huge = "a".repeat(30_000);
  expect(highlight(huge, "js")).toEqual([{ type: "plain", text: huge }]);
});
