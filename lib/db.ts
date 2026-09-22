/**
 * Embedded SQLite store for UI-only metadata that OpenBao does not model.
 *
 * This is the BFF's small stateful layer. It holds NON-SECRET presentation and
 * configuration data — friendly "nicer naming" labels for namespaces / mounts /
 * paths, and UI config (branding, login customization). Secrets, identity and
 * all real authorization stay native to OpenBao.
 *
 * Server-only: imported exclusively by route handlers (Node runtime). The file
 * lives on the same writable volume as OpenBao's storage (default
 * /bao/file/ui.db); override with UI_DB_PATH (":memory:" is honored for tests).
 *
 * Uses Node's built-in `node:sqlite` (no native dependency, no extra image
 * layers). Available unflagged on the Node 22 the runtime image ships.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type LabelScope = "workspace" | "environment" | "project";

/** A friendly-naming row keyed to a native OpenBao path. */
export type Label = {
  namespace: string; // OpenBao namespace the ref lives in ("" = root)
  scope: LabelScope; // workspace=namespace, environment=mount, project=path
  ref: string; // the native key (namespace path, mount path, or project path)
  label: string | null;
  description: string | null;
  color: string | null;
  env_group: string | null; // e.g. "dev" | "staging" | "prod" for environments
  updated_at: number;
};

function dbPath(): string {
  return process.env.UI_DB_PATH ?? "/bao/file/ui.db";
}

let _db: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (_db) return _db;
  const path = dbPath();
  if (path !== ":memory:") {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      // directory already exists / not creatable — let the open call surface it
    }
  }
  const d = new DatabaseSync(path);
  d.exec(
    "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
  );
  try {
    migrate(d, path);
  } catch (err) {
    // _db is only assigned on success, so without this an open handle leaks on
    // every request that retries after a failed migration.
    d.close();
    throw err;
  }
  _db = d;
  return d;
}

/** Current on-disk schema. Bump whenever migrate() gains a step. */
const SCHEMA_VERSION = 2;

function userVersion(d: DatabaseSync): number {
  // A PRAGMA read comes back as a single row named after the pragma.
  const row = d.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

function setUserVersion(d: DatabaseSync, v: number) {
  // "PRAGMA user_version = ?" is a syntax error — SQLite wants a literal here.
  // v is a module constant, never caller input; the guard keeps it that way.
  if (!Number.isInteger(v)) throw new Error("schema version must be an integer");
  d.exec(`PRAGMA user_version = ${v}`);
}

function ensureSchema(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS labels (
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
    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      json       TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

/**
 * A brand-new store has no tables yet. Probed through sqlite_master rather than
 * the filesystem: opening the connection and setting journal_mode = WAL has
 * already created the file by the time we get here.
 */
function isFreshDatabase(d: DatabaseSync): boolean {
  const row = d
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('labels', 'config')",
    )
    .get() as { n: number };
  return row.n === 0;
}

/**
 * Snapshot the store beside itself before a destructive migration. VACUUM INTO
 * writes one consistent file (WAL folded in, no -wal/-shm sidecars) and MUST run
 * outside a transaction. SQLite refuses an existing destination, so a leftover
 * backup from an earlier failed attempt is kept and this one is timestamped.
 */
function backupBeforeMigration(d: DatabaseSync, path: string, to: number): string {
  const base = `${path}.pre-v${to}.bak`;
  const dest = existsSync(base) ? `${path}.pre-v${to}.${Date.now()}.bak` : base;
  // Bound parameter, not interpolation: a double-quoted path parses as an
  // identifier ("no such column: /bao/file/ui.db").
  d.prepare("VACUUM INTO ?").run(dest);
  return dest;
}

/** v1 -> v2: the 'application' label scope was renamed to 'project'. */
function renameApplicationScope(d: DatabaseSync) {
  // Plain UPDATE, never OR REPLACE: a (namespace, 'project', ref) row cannot
  // exist in a v1 store, and if one somehow does we want the PK conflict to
  // abort the migration rather than silently drop somebody's label.
  d.exec("UPDATE labels SET scope = 'project' WHERE scope = 'application'");
}

const OLD_CRED_PREFIX = "app-credentials::";
const NEW_CRED_PREFIX = "project-credentials::";

/**
 * Rename `app` to `project` on every credential in one stored array. Throws
 * rather than salvaging: these rows are the only record of which AppRoles the UI
 * issued, so a half-migrated row would orphan live credentials in OpenBao with
 * nothing left pointing at them.
 */
function renameAppField(key: string, json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `config row "${key}" holds unparseable JSON (${String(err)}); refusing to migrate it`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `config row "${key}" is not an array of credentials; refusing to migrate it`,
    );
  }
  return JSON.stringify(
    parsed.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const cred = { ...(entry as Record<string, unknown>) };
      if ("app" in cred) {
        cred.project = cred.app;
        delete cred.app;
      }
      return cred;
    }),
  );
}

/**
 * v1 -> v2: `app-credentials::<ns>` becomes `project-credentials::<ns>`. The
 * namespace suffix is arbitrary, so rows are found with LIKE — '%' also covers
 * the empty suffix the root namespace uses ("app-credentials::").
 */
function renameCredentialKeys(d: DatabaseSync) {
  const rows = d
    .prepare("SELECT key, json FROM config WHERE key LIKE ? ORDER BY key")
    .all(`${OLD_CRED_PREFIX}%`) as { key: string; json: string }[];

  // Updating the TEXT PRIMARY KEY in place keeps updated_at, which records when
  // an operator last saved these credentials — not when we rewrote a field name.
  const update = d.prepare("UPDATE config SET key = ?, json = ? WHERE key = ?");
  for (const row of rows) {
    // Slice the prefix; do NOT use SQL replace() on the whole key — a namespace
    // that itself contained the prefix would get rewritten twice.
    const next = NEW_CRED_PREFIX + row.key.slice(OLD_CRED_PREFIX.length);
    update.run(next, renameAppField(row.key, row.json), row.key);
  }
  // access-roles::<ns>, role-templates::<ns>, onboarding::<ns> and ui are
  // deliberately untouched: their objects key on `name` / have no `app` field.
}

/**
 * Bring the store up to SCHEMA_VERSION. Called once per connection from db().
 *
 * The version lives in PRAGMA user_version — a header field, so there is no meta
 * table to bootstrap, and it rolls back with the surrounding transaction. v1 is
 * implicit: the default 0 *with the tables already present*. A brand-new file is
 * 0 with no tables and goes straight to SCHEMA_VERSION with no rename pass and
 * no .bak left behind.
 *
 * Nothing in here may call db(), getConfig() or setConfig(): _db is not assigned
 * until migrate() returns, so a helper call would open a SECOND connection that
 * blocks on our own write lock.
 */
function migrate(d: DatabaseSync, path: string) {
  if (userVersion(d) >= SCHEMA_VERSION) return;

  const fresh = isFreshDatabase(d);

  // VACUUM INTO cannot run inside a transaction, so the snapshot is taken before
  // BEGIN. Nothing destructive has happened yet, so a crash in the gap only
  // leaves a backup the next attempt supersedes. Skipped for :memory: (no file)
  // and for fresh stores (nothing to lose, and a .bak per clean install is noise).
  const backup =
    fresh || path === ":memory:" ? null : backupBeforeMigration(d, path, SCHEMA_VERSION);

  // BEGIN IMMEDIATE, not a bare BEGIN: a deferred transaction takes a read lock
  // first, and the read->write upgrade can return SQLITE_BUSY *immediately*
  // without honoring busy_timeout. IMMEDIATE takes the write lock up front,
  // which is what busy_timeout actually waits on when a second process on the
  // same volume is migrating.
  d.exec("BEGIN IMMEDIATE");
  try {
    // Re-read under the write lock: another process may have finished while we
    // were queued behind it.
    if (userVersion(d) >= SCHEMA_VERSION) {
      d.exec("COMMIT");
      return;
    }
    ensureSchema(d);
    if (!fresh) {
      renameApplicationScope(d);
      renameCredentialKeys(d);
    }
    setUserVersion(d, SCHEMA_VERSION);
    d.exec("COMMIT");
  } catch (err) {
    // A statement-level failure leaves the transaction open and rollbackable. An
    // I/O-level failure may have already unwound it, in which case ROLLBACK
    // itself throws "no transaction is active" — swallow that so the real cause
    // survives.
    try {
      d.exec("ROLLBACK");
    } catch {
      // already unwound by SQLite
    }
    throw new Error(
      `ui.db migration to v${SCHEMA_VERSION} failed and was rolled back${
        backup ? ` (pre-migration backup: ${backup})` : ""
      }: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/** Test-only: close and forget the connection so a fresh UI_DB_PATH is picked up. */
export function __closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

// --- labels ---------------------------------------------------------------

/** All labels for a namespace, optionally narrowed to one scope. */
export function listLabels(namespace: string, scope?: LabelScope): Label[] {
  const rows = scope
    ? db()
        .prepare(
          "SELECT * FROM labels WHERE namespace = ? AND scope = ? ORDER BY ref",
        )
        .all(namespace, scope)
    : db()
        .prepare("SELECT * FROM labels WHERE namespace = ? ORDER BY scope, ref")
        .all(namespace);
  return rows as unknown as Label[];
}

export type LabelInput = {
  namespace: string;
  scope: LabelScope;
  ref: string;
  label?: unknown;
  description?: unknown;
  color?: unknown;
  env_group?: unknown;
};

/**
 * Insert/update a label. If every field is empty the row is removed instead —
 * so "clear all fields + save" is how a user resets to the native name.
 * Returns the stored row, or null when it was cleared.
 */
export function upsertLabel(input: LabelInput): Label | null {
  const { namespace, scope, ref } = input;
  const label = clean(input.label);
  const description = clean(input.description);
  const color = clean(input.color);
  const env_group = clean(input.env_group);

  if (!label && !description && !color && !env_group) {
    db()
      .prepare("DELETE FROM labels WHERE namespace = ? AND scope = ? AND ref = ?")
      .run(namespace, scope, ref);
    return null;
  }

  const updated_at = Date.now();
  db()
    .prepare(
      `INSERT INTO labels (namespace, scope, ref, label, description, color, env_group, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace, scope, ref) DO UPDATE SET
         label = excluded.label,
         description = excluded.description,
         color = excluded.color,
         env_group = excluded.env_group,
         updated_at = excluded.updated_at`,
    )
    .run(namespace, scope, ref, label, description, color, env_group, updated_at);

  return { namespace, scope, ref, label, description, color, env_group, updated_at };
}

// --- config ---------------------------------------------------------------

export function getConfig<T = unknown>(key: string): T | null {
  const row = db().prepare("SELECT json FROM config WHERE key = ?").get(key) as
    | { json: string }
    | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}

export function setConfig(key: string, value: unknown): void {
  db()
    .prepare(
      `INSERT INTO config (key, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), Date.now());
}
