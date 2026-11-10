/**
 * A small, dependency-free syntax highlighter for the languages people paste
 * into notes most often. It tokenizes with ordered sticky regexes: at each
 * position the first rule that matches wins; anything else is plain text.
 * It is not a parser, but it is fast, predictable and easy to test.
 */

export type TokenType =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "literal"
  | "function"
  | "type"
  | "property"
  | "tag"
  | "attr"
  | "variable"
  | "operator";

export interface Token {
  type: TokenType;
  text: string;
}

type Rule = [TokenType, RegExp];

const words = (list: string) => new RegExp(`\\b(?:${list.split(" ").join("|")})\\b`, "y");

const JS_KEYWORDS =
  "abstract as async await break case catch class const continue debugger declare default delete do else enum export extends finally for from function get if implements import in instanceof interface keyof let new of private protected public readonly return satisfies set static super switch this throw try type typeof var void while with yield";

const JS: Rule[] = [
  ["comment", /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
  ["string", /`(?:\\[\s\S]|[^\\`])*`?|"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?/y],
  ["number", /\b(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?)\b/y],
  ["literal", words("true false null undefined NaN Infinity")],
  ["keyword", words(JS_KEYWORDS)],
  ["type", /\b[A-Z][\w$]*\b/y],
  ["function", /\b[a-zA-Z_$][\w$]*(?=\s*\()/y],
  ["operator", /=>|[=!<>]=?=?|[+\-*/%&|^~?:]+/y],
];

const JSON_RULES: Rule[] = [
  ["property", /"(?:\\.|[^\\"\n])*"(?=\s*:)/y],
  ["string", /"(?:\\.|[^\\"\n])*"?/y],
  ["number", /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
  ["literal", words("true false null")],
];

const CSS: Rule[] = [
  ["comment", /\/\*[\s\S]*?(?:\*\/|$)/y],
  ["string", /"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?/y],
  ["keyword", /@[\w-]+/y],
  ["property", /[\w-]+(?=\s*:(?![^{]*\{))/y],
  ["number", /#[\da-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|r?em|%|vh|vw|s|ms|deg|fr)?\b/y],
  ["function", /[\w-]+(?=\()/y],
  ["tag", /[.#]?[a-zA-Z][\w-]*(?=[^;{}]*\{)/y],
];

const HTML: Rule[] = [
  ["comment", /<!--[\s\S]*?(?:-->|$)/y],
  ["tag", /<\/?[a-zA-Z][\w:-]*|\/?>/y],
  ["attr", /\b[a-zA-Z_:][\w:.-]*(?==)/y],
  ["string", /"[^"]*"?|'[^']*'?/y],
];

const BASH: Rule[] = [
  ["comment", /(?<![\w$])#[^\n]*/y],
  ["string", /"(?:\\.|[^\\"])*"?|'[^']*'?/y],
  ["variable", /\$\{[^}]*\}?|\$[\w@#?*!-]+/y],
  ["keyword", words("if then else elif fi for in do done while until case esac function return export local readonly unset source sudo")],
  ["attr", /(?<=\s)--?[\w-]+/y],
  ["number", /\b\d+\b/y],
  ["function", /^\s*[\w.-]+|(?<=[|;&]\s*)[\w.-]+/my],
];

const PYTHON: Rule[] = [
  ["comment", /#[^\n]*/y],
  ["string", /[rbfu]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?)/iy],
  ["function", /@[\w.]+|\b[a-zA-Z_]\w*(?=\s*\()/y],
  ["number", /\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?j?\b/y],
  ["literal", words("True False None")],
  ["keyword", words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield self")],
  ["type", /\b[A-Z]\w*\b/y],
];

const GRAMMARS: Record<string, Rule[]> = {
  js: JS, jsx: JS, javascript: JS, mjs: JS, cjs: JS,
  ts: JS, tsx: JS, typescript: JS,
  json: JSON_RULES, jsonc: JS,
  css: CSS, scss: CSS,
  html: HTML, xml: HTML, svg: HTML, vue: HTML,
  bash: BASH, sh: BASH, shell: BASH, zsh: BASH, console: BASH,
  py: PYTHON, python: PYTHON,
};

/** Above this size highlighting is skipped to keep typing responsive. */
const MAX_LENGTH = 20_000;

export function isSupportedLanguage(lang: string): boolean {
  return lang.toLowerCase() in GRAMMARS;
}

export function highlight(code: string, lang: string): Token[] {
  const rules = GRAMMARS[lang.toLowerCase()];
  if (!rules || code.length > MAX_LENGTH) return [{ type: "plain", text: code }];

  const tokens: Token[] = [];
  const push = (type: TokenType, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.text += text;
    else tokens.push({ type, text });
  };

  let pos = 0;
  outer: while (pos < code.length) {
    for (const [type, re] of rules) {
      re.lastIndex = pos;
      const match = re.exec(code);
      if (match && match[0].length > 0) {
        push(type, match[0]);
        pos += match[0].length;
        continue outer;
      }
    }
    // Consume a whole word at once so keywords are not matched mid-identifier.
    const word = /[\w$]+|\s+|./y;
    word.lastIndex = pos;
    const text = word.exec(code)![0];
    push("plain", text);
    pos += text.length;
  }
  return tokens;
}
