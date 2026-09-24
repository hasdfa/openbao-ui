import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { __closeDb, getConfig, listLabels } from "@/lib/db";

/**
 * The v1 store had no version marker: user_version stayed 0 and the scope
 * column held 'application'. Fixtures are built with a raw connection so the
 * module under test still sees a genuine pre-migration file on first open.
 */
function seedV1(file: string, rows: { labels?: unknown[][]; config?: [string, string][] } = {}) {
  const d = new DatabaseSync(file);
  d.exec(`
    CREATE TABLE labels (
      namespace   TEXT NOT NULL,
      scope       TEXT NOT NULL,
      ref         TEXT NOT NULL,
      label       TEXT,
      description TEXT,
      color       TEXT,
      env_group   TEXT,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (namespace, scope, ref)
    );
    CREATE TABLE config (
      key        TEXT PRIMARY KEY,
      json       TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const label = d.prepare(
    "INSERT INTO labels (namespace, scope, ref, label, description, color, env_group, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const r of rows.labels ?? []) label.run(...(r as never[]));
  const cfg = d.prepare("INSERT INTO config (key, json, updated_at) VALUES (?, ?, ?)");
  for (const [k, j] of rows.config ?? []) cfg.run(k, j, 1000);
  d.close();
}

/** Read a file directly, bypassing the module's connection and its migration. */
function raw<T>(file: string, fn: (d: DatabaseSync) => T): T {
  const d = new DatabaseSync(file);
  try {
    return fn(d);
  } finally {
    d.close();
  }
}

const CRED = JSON.stringify([
  {
    app: "api",
    level: "viewer",
    env: { kind: "mounts", mounts: ["prod"] },
    mount: "approle",
    ttl: "1h",
    paths: ["api/*"],
    roles: [{ env: "prod", role: "api-prod-x", policy: "api-read" }],
    createdAt: 7,
  },
]);

let dir: string;

/** Each case needs its own file: the migration runs once per database. */
function freshDir(): string {
  dir = mkdtempSync(join(tmpdir(), "ui-db-mig-"));
  process.env.UI_DB_PATH = join(dir, "ui.db");
  return join(dir, "ui.db");
}

afterEach(() => {
  __closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("schema migration v1 -> v2", () => {
  it("stamps a brand-new store at v2 without emitting a backup", () => {
    const file = freshDir();
    expect(listLabels("")).toEqual([]); // opens + migrates

    expect(raw(file, (d) => (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)).toBe(2);
    expect(readdirSync(dir).filter((f) => f.includes(".bak"))).toHaveLength(0);
  });

  it("renames the application scope and leaves other scopes alone", () => {
    const file = freshDir();
    seedV1(file, {
      labels: [
        ["", "application", "backend", "Backend", null, "emerald", null, 5],
        ["", "environment", "prod/", "Production", null, null, "prod", 5],
        ["", "workspace", "team-a", "Team A", null, null, null, 5],
      ],
    });

    expect(listLabels("", "project")).toMatchObject([{ ref: "backend", label: "Backend" }]);
    expect(listLabels("", "environment")).toHaveLength(1);
    expect(listLabels("", "workspace")).toHaveLength(1);
  });

  it("renames the credential key and its app field, preserving every other field", () => {
    const file = freshDir();
    seedV1(file, {
      config: [
        ["app-credentials::team-a", CRED],
        ["access-roles::team-a", JSON.stringify([{ name: "r", level: "viewer" }])],
      ],
    });

    const creds = getConfig<Record<string, unknown>[]>("project-credentials::team-a");
    expect(creds?.[0]).toEqual({
      project: "api",
      level: "viewer",
      env: { kind: "mounts", mounts: ["prod"] },
      mount: "approle",
      ttl: "1h",
      paths: ["api/*"],
      roles: [{ env: "prod", role: "api-prod-x", policy: "api-read" }],
      createdAt: 7,
    });
    expect(getConfig("app-credentials::team-a")).toBeNull();
    // untouched: AccessRole keys on `name`, it has no app field
    expect(getConfig<unknown[]>("access-roles::team-a")).toEqual([{ name: "r", level: "viewer" }]);
    // the rename must not pose as an operator edit
    expect(raw(file, (d) => d.prepare("SELECT updated_at FROM config WHERE key = ?").get("project-credentials::team-a"))).toMatchObject({ updated_at: 1000 });
  });

  it("writes a backup that still reads as v1", () => {
    const file = freshDir();
    seedV1(file, {
      labels: [["", "application", "backend", "Backend", null, null, null, 5]],
      config: [["app-credentials::", CRED]],
    });
    listLabels("");

    const bak = `${file}.pre-v2.bak`;
    expect(raw(bak, (d) => (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)).toBe(0);
    expect(raw(bak, (d) => d.prepare("SELECT scope FROM labels").get())).toMatchObject({ scope: "application" });
    expect(raw(bak, (d) => d.prepare("SELECT count(*) AS n FROM config WHERE key = 'app-credentials::'").get())).toMatchObject({ n: 1 });
  });

  it("renames the root namespace's key, whose suffix is empty", () => {
    const file = freshDir();
    seedV1(file, { config: [["app-credentials::", CRED]] });

    expect(getConfig<Record<string, unknown>[]>("project-credentials::")?.[0]).toMatchObject({ project: "api" });
    expect(getConfig("app-credentials::")).toBeNull();
  });

  it("rewrites a namespace containing the prefix and a LIKE wildcard exactly once", () => {
    const file = freshDir();
    seedV1(file, { config: [["app-credentials::odd%app-credentials::x", CRED]] });

    expect(getConfig("project-credentials::odd%app-credentials::x")).not.toBeNull();
    expect(getConfig("app-credentials::odd%app-credentials::x")).toBeNull();
  });

  it("is idempotent across reopens", () => {
    const file = freshDir();
    seedV1(file, { labels: [["", "application", "backend", "B", null, null, null, 5]] });
    listLabels("");
    __closeDb();
    listLabels("");

    expect(readdirSync(dir).filter((f) => f.includes(".bak"))).toHaveLength(1);
    expect(listLabels("", "project")).toHaveLength(1);
  });

  it.each([
    ["unparseable JSON", "{not json"],
    ["a non-array payload", JSON.stringify({ creds: [] })],
  ])("aborts and rolls back on %s, changing nothing", (_label, json) => {
    const file = freshDir();
    seedV1(file, {
      labels: [["", "application", "backend", "B", null, null, null, 5]],
      config: [["app-credentials::x", json]],
    });

    expect(() => listLabels("")).toThrow(/refusing to migrate/);
    expect(raw(file, (d) => (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)).toBe(0);
    expect(raw(file, (d) => d.prepare("SELECT scope FROM labels").get())).toMatchObject({ scope: "application" });
    expect(raw(file, (d) => d.prepare("SELECT count(*) AS n FROM config WHERE key = 'app-credentials::x'").get())).toMatchObject({ n: 1 });
  });

  it("aborts when the destination key already exists", () => {
    const file = freshDir();
    seedV1(file, {
      config: [
        ["app-credentials::a", CRED],
        ["project-credentials::a", CRED],
      ],
    });

    expect(() => listLabels("")).toThrow(/rolled back/);
    expect(raw(file, (d) => (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)).toBe(0);
  });

  it("aborts when a project-scoped label already occupies the primary key", () => {
    const file = freshDir();
    seedV1(file, {
      labels: [
        ["ns", "application", "x", "Old", null, null, null, 5],
        ["ns", "project", "x", "New", null, null, null, 5],
      ],
    });

    expect(() => listLabels("ns")).toThrow(/rolled back/);
    expect(raw(file, (d) => d.prepare("SELECT count(*) AS n FROM labels WHERE scope = 'application'").get())).toMatchObject({ n: 1 });
  });

  it("recovers once the offending row is fixed, caching no broken state", () => {
    const file = freshDir();
    seedV1(file, {
      labels: [["", "application", "backend", "B", null, null, null, 5]],
      config: [["app-credentials::x", "{not json"]],
    });

    expect(() => listLabels("")).toThrow(/refusing to migrate/);
    raw(file, (d) =>
      d.prepare("UPDATE config SET json = ? WHERE key = ?").run(CRED, "app-credentials::x"),
    );
    __closeDb();

    // the retry must migrate cleanly rather than trip over a half-open handle
    expect(listLabels("", "project")).toHaveLength(1);
    expect(getConfig<Record<string, unknown>[]>("project-credentials::x")?.[0]).toMatchObject({
      project: "api",
    });
  });

  it("keeps a single backup however many times a failing migration is retried", () => {
    const file = freshDir();
    seedV1(file, {
      labels: [["", "application", "backend", "B", null, null, null, 5]],
      config: [["app-credentials::x", "{not json"]],
    });

    for (let i = 0; i < 3; i++) {
      expect(() => listLabels("")).toThrow(/refusing to migrate/);
      __closeDb();
    }

    expect(readdirSync(dir).filter((f) => f.includes(".bak"))).toEqual(["ui.db.pre-v2.bak"]);
    expect(raw(`${file}.pre-v2.bak`, (d) => d.prepare("SELECT scope FROM labels").get())).toMatchObject({ scope: "application" });
  });

  it("passes through entries that are already v2 or are not objects", () => {
    const file = freshDir();
    seedV1(file, {
      config: [["app-credentials::x", JSON.stringify([{ project: "done" }, null, "odd"])]],
    });

    expect(getConfig<unknown[]>("project-credentials::x")).toEqual([{ project: "done" }, null, "odd"]);
  });

  it("takes no backup for an in-memory store", () => {
    freshDir();
    process.env.UI_DB_PATH = ":memory:";
    expect(listLabels("")).toEqual([]);

    expect(readdirSync(process.cwd()).filter((f) => f.startsWith(":memory:"))).toHaveLength(0);
  });
});
