import { expect, test } from "@playwright/test";
import { hasDiagram, hasMath } from "@/app/lib/markdownExtras";

test("hasMath finds inline and block math, not prices or code", () => {
  expect(hasMath("Euler: $e^{i\\pi} + 1 = 0$")).toBe(true);
  expect(hasMath("$$\n\\int_0^1 x\\,dx\n$$")).toBe(true);
  expect(hasMath("It costs $5 and $10")).toBe(false);
  expect(hasMath("`$x$` in code")).toBe(false);
  expect(hasMath("```\n$x$\n```")).toBe(false);
  expect(hasMath("no dollars")).toBe(false);
});

test("hasDiagram spots mermaid blocks", () => {
  expect(hasDiagram("```mermaid\ngraph TD; A-->B\n```")).toBe(true);
  expect(hasDiagram("```js\nmermaid()\n```")).toBe(false);
});
