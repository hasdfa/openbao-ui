import { describe, expect, it } from "vitest";

import { parseDotenv, parseYaml, stringifyDotenv, stringifyYaml, tokenize } from "@/lib/secret-formats";

const PEM = "-----BEGIN KEY-----\nMIIBOgIBAAJBAKj34\n-----END KEY-----";

describe("dotenv", () => {
  it("parses comments, export, quotes and inline comments", () => {
    expect(
      parseDotenv(`# app\nexport A=1\nB = "two words" # note\nC='lit\\n'\nD=x # c\n\n`),
    ).toEqual({ A: "1", B: "two words", C: "lit\\n", D: "x" });
  });

  it("keeps multi-line quoted values such as PEM keys", () => {
    expect(parseDotenv(`KEY="${PEM}"\nNEXT=1`)).toEqual({ KEY: PEM, NEXT: "1" });
  });

  it("unescapes double-quoted values", () => {
    expect(parseDotenv(String.raw`A="a\"b\\c\nd"`)).toEqual({ A: 'a"b\\c\nd' });
  });

  it("round-trips anything it can express", () => {
    const data = { URL: "postgres://u:p@h:5432/db?ssl=true", PEM, QUOTE: 'say "hi"', EMPTY: "", "db.url": "x y" };
    expect(parseDotenv(stringifyDotenv(data))).toEqual(data);
  });

  it("reports the line of a bad entry, a duplicate or an open quote", () => {
    expect(() => parseDotenv("A=1\nnope")).toThrow(/Line 2/);
    expect(() => parseDotenv("A=1\nA=2")).toThrow(/Line 2: duplicate/);
    expect(() => parseDotenv('A="open')).toThrow(/unterminated/);
  });

  it("refuses data it can't express rather than mangling it", () => {
    expect(() => stringifyDotenv({ nested: { a: 1 } })).toThrow(/YAML or JSON/);
    expect(() => stringifyDotenv({ "has space": "x" })).toThrow(/YAML or JSON/);
  });
});

describe("yaml", () => {
  it("round-trips strings that look like numbers, booleans and multi-line values", () => {
    const data = { PORT: "8080", FLAG: "true", PEM, nested: { a: [1, 2] } };
    expect(parseYaml(stringifyYaml(data))).toEqual(data);
  });

  it("rejects non-mappings and duplicate keys", () => {
    expect(() => parseYaml("- a\n- b")).toThrow(/mapping/);
    expect(() => parseYaml("a: 1\na: 2")).toThrow();
  });

  it("treats an empty document as no fields", () => {
    expect(parseYaml("  \n")).toEqual({});
  });
});

describe("tokenize", () => {
  it("reproduces the source text exactly, so the overlay lines up", () => {
    for (const [format, text] of [
      ["dotenv", `# c\nexport A=1\nB="x\ny" # t\nC=v # c`],
      ["yaml", `a: 1 # c\nb: |\n  line\n  two\nc: "s"\n- x`],
      ["json", `{\n  "a": 1,\n  "b": [true, null, "s"]\n}`],
    ] as const) {
      expect(tokenize(format, text).map((t) => t.text).join("")).toBe(text);
    }
  });
});
