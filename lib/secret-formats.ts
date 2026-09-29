import { parseDocument, stringify as yamlStringify } from "yaml";

/**
 * Text formats for editing a KV secret's data. Every format parses to the same
 * `Record<string, unknown>` OpenBao stores, so switching formats is a lossless
 * round trip through the data, never text-to-text.
 */
export type SecretFormat = "dotenv" | "yaml" | "json";

export type Data = Record<string, unknown>;

// --- dotenv ------------------------------------------------------------------

// Wider than POSIX: OpenBao keys commonly carry dots and dashes (`db.url`).
const DOTENV_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const BARE_VALUE = /^[A-Za-z0-9_./:@+,%=-]*$/;

/** Parse a .env file. Throws with a 1-based line number on the first problem. */
export function parseDotenv(text: string): Data {
  const out: Data = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].replace(/^\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/.exec(line);
    if (!m) throw new Error(`Line ${lineNo}: expected KEY=value`);
    const [, key, rest] = m;
    if (!DOTENV_KEY.test(key)) throw new Error(`Line ${lineNo}: "${key}" is not a valid key`);
    if (key in out) throw new Error(`Line ${lineNo}: duplicate key "${key}"`);

    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      // Quoted values may span lines (PEM keys, certificates).
      let body = rest.slice(1);
      let end = findClosing(body, quote);
      while (end === -1 && i + 1 < lines.length) {
        body += "\n" + lines[++i];
        end = findClosing(body, quote);
      }
      if (end === -1) throw new Error(`Line ${lineNo}: unterminated ${quote} quote`);
      const trailing = body.slice(end + 1).trim();
      if (trailing && !trailing.startsWith("#")) {
        throw new Error(`Line ${lineNo}: unexpected text after closing quote`);
      }
      const raw = body.slice(0, end);
      out[key] = quote === '"' ? unescapeDouble(raw) : raw;
    } else {
      // Unquoted: an inline comment needs whitespace before the #.
      out[key] = rest.replace(/\s+#.*$/, "").trim();
    }
  }
  return out;
}

function findClosing(body: string, quote: string): number {
  for (let i = 0; i < body.length; i++) {
    if (quote === '"' && body[i] === "\\") {
      i++;
      continue;
    }
    if (body[i] === quote) return i;
  }
  return -1;
}

function unescapeDouble(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) =>
    c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c,
  );
}

/** Serialize to .env. Throws when the data can't be expressed as flat strings. */
export function stringifyDotenv(data: Data): string {
  return Object.entries(data)
    .map(([key, value]) => {
      if (typeof value !== "string") {
        throw new Error(`"${key}" isn't a string; edit this secret as YAML or JSON`);
      }
      if (!DOTENV_KEY.test(key)) {
        throw new Error(`"${key}" can't be a .env key; edit this secret as YAML or JSON`);
      }
      if (BARE_VALUE.test(value)) return `${key}=${value}`;
      // Real newlines inside double quotes keep PEM blocks readable.
      return `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    })
    .join("\n");
}

// --- yaml & json ---------------------------------------------------------------

function asObject(parsed: unknown, what: string): Data {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Secret data must be a ${what} mapping of keys to values`);
  }
  return parsed as Data;
}

export function parseYaml(text: string): Data {
  if (!text.trim()) return {};
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) {
    const e = doc.errors[0];
    const line = e.linePos?.[0]?.line;
    throw new Error(`${line ? `Line ${line}: ` : ""}${e.message.split("\n")[0]}`);
  }
  return asObject(doc.toJS(), "YAML");
}

export function stringifyYaml(data: Data): string {
  if (!Object.keys(data).length) return "";
  // lineWidth 0: never fold long tokens or keys across lines.
  return yamlStringify(data, { lineWidth: 0 }).replace(/\n$/, "");
}

export function parseJson(text: string): Data {
  return asObject(JSON.parse(text), "JSON");
}

export const stringifyJson = (data: Data) => JSON.stringify(data, null, 2);

export const PARSE: Record<SecretFormat, (text: string) => Data> = {
  dotenv: parseDotenv,
  yaml: parseYaml,
  json: parseJson,
};

export const STRINGIFY: Record<SecretFormat, (data: Data) => string> = {
  dotenv: stringifyDotenv,
  yaml: stringifyYaml,
  json: stringifyJson,
};

// --- highlighting ----------------------------------------------------------------

export type TokenKind = "key" | "string" | "number" | "literal" | "comment" | "punct" | "plain";
export type Token = { kind: TokenKind; text: string };

const push = (out: Token[], kind: TokenKind, text: string) => {
  if (text) out.push({ kind, text });
};

/** Line-oriented tokenizer: good enough to colour, never used to parse. */
export function tokenize(format: SecretFormat, text: string): Token[] {
  const out: Token[] = [];
  const lines = text.split("\n");
  let inQuote: string | null = null; // dotenv multi-line quoted value
  let blockIndent = -1; // yaml block scalar body
  lines.forEach((line, i) => {
    if (i > 0) push(out, "plain", "\n");
    if (format === "json") return tokenizeJsonLine(out, line);
    if (format === "dotenv") {
      if (inQuote) {
        const end = findClosing(line, inQuote);
        if (end === -1) return push(out, "string", line);
        push(out, "string", line.slice(0, end + 1));
        push(out, "comment", line.slice(end + 1));
        inQuote = null;
        return;
      }
      const m = /^(\s*)(export\s+)?([^=\s#]+)(\s*=\s?)(.*)$/.exec(line);
      if (!m || line.trimStart().startsWith("#")) {
        return push(out, line.trimStart().startsWith("#") ? "comment" : "plain", line);
      }
      const [, lead, exp, key, eq, value] = m;
      push(out, "plain", lead);
      push(out, "literal", exp ?? "");
      push(out, "key", key);
      push(out, "punct", eq);
      const q = value[0];
      if (q === '"' || q === "'") {
        const end = findClosing(value.slice(1), q);
        if (end === -1) inQuote = q;
        push(out, "string", end === -1 ? value : value.slice(0, end + 2));
        if (end !== -1) push(out, "comment", value.slice(end + 2));
      } else {
        const c = /\s+#.*$/.exec(value);
        push(out, "string", c ? value.slice(0, c.index) : value);
        push(out, "comment", c ? c[0] : "");
      }
      return;
    }
    // yaml
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0) {
      if (!line.trim() || indent > blockIndent) return push(out, "string", line);
      blockIndent = -1;
    }
    if (line.trimStart().startsWith("#")) return push(out, "comment", line);
    const m = /^(\s*)(-\s+)?([^:#]+?)(:)(\s|$)(.*)$/.exec(line);
    if (!m) {
      const d = /^(\s*)(-\s+)?(.*)$/.exec(line)!;
      push(out, "plain", d[1]);
      push(out, "punct", d[2] ?? "");
      return pushYamlScalar(out, d[3]);
    }
    const [, lead, dash, key, colon, space, value] = m;
    push(out, "plain", lead);
    push(out, "punct", dash ?? "");
    push(out, "key", key);
    push(out, "punct", colon);
    push(out, "plain", space);
    if (/^[|>][-+0-9]*\s*(#.*)?$/.test(value.trim())) {
      blockIndent = indent;
      return push(out, "punct", value);
    }
    pushYamlScalar(out, value);
  });
  return out;
}

function pushYamlScalar(out: Token[], value: string) {
  const c = /(^|\s)#.*$/.exec(value);
  const body = c ? value.slice(0, c.index) : value;
  const t = body.trim();
  const kind: TokenKind = /^(true|false|null|~|yes|no|on|off)$/i.test(t)
    ? "literal"
    : /^[-+]?(\d[\d_]*\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)
      ? "number"
      : "string";
  push(out, kind, body);
  push(out, "comment", c ? value.slice(c.index) : "");
}

function tokenizeJsonLine(out: Token[], line: string) {
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    push(out, "plain", line.slice(last, m.index));
    if (m[1]) {
      push(out, m[2] ? "key" : "string", m[1]);
      push(out, "punct", m[2] ?? "");
    } else if (m[3]) push(out, "number", m[3]);
    else if (m[4]) push(out, "literal", m[4]);
    else push(out, "punct", m[5]);
    last = re.lastIndex;
  }
  push(out, "plain", line.slice(last));
}
