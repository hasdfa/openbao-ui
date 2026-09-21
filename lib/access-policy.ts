// Pure ACL-policy generator for scoped access. Given a set of resolved
// environments × the secret paths a client may touch × a capability level, it
// emits native OpenBao ACL HCL over the KV v2 data/metadata paths. No I/O — easy
// to unit-test and shown to the operator before it's written.
//
// Paths are env-relative suffixes that map 1:1 to policy paths:
//   "backend/*"            -> <mount>/data/backend/*        (a folder, recursive)
//   "shared/stripe/config" -> <mount>/data/shared/stripe/config  (one secret)
//   "*"                    -> <mount>/data/*                (the whole environment)
//
// Supports both physical layouts:
//   - mount per environment:        { mount: "prod" }                    -> prod/data/<p>
//   - single mount with env folders:{ mount: "secret", envPath: "prod" } -> secret/data/prod/<p>

export type AccessLevel = "viewer" | "editor" | "admin";

/** A resolved environment target. `envPath` is the env folder for the
 *  single-mount layout; omit it when each environment is its own mount. */
export type EnvTarget = { mount: string; envPath?: string };

export type AccessScope = {
  envs: EnvTarget[];
  level: AccessLevel;
  paths?: string[]; // env-relative path suffixes; empty = whole environment ("*")
};

const strip = (s: string) => s.replace(/^\/+|\/+$/g, "");
function policyPath(value: string, glob = false): string {
  const path = strip(value);
  const allowed = glob ? /^[A-Za-z0-9._\-/*+]+$/ : /^[A-Za-z0-9._\-/]+$/;
  const parts = path.split("/");
  if (!allowed.test(path) || parts.some((part) => !part || part === "." || part === "..") ||
      (glob && (path.slice(0, -1).includes("*") || parts.some((part) => part.includes("+") && part !== "+")))) {
    throw new Error("Unsupported policy path. Use letters, numbers, _ . - and /; globs allow a trailing * or a whole-segment +.");
  }
  return path;
}

// KV v2 secret data lives under <mount>/data/..., listing/versioning under
// <mount>/metadata/.... Editors get full CRUD on data; metadata stays read/list
// (browse + version history) except for admins who can purge it.
const DATA_CAPS: Record<AccessLevel, string[]> = {
  viewer: ["read", "list"],
  editor: ["create", "read", "update", "delete", "list"],
  admin: ["create", "read", "update", "delete", "list", "sudo"],
};
const META_CAPS: Record<AccessLevel, string[]> = {
  viewer: ["read", "list"],
  editor: ["read", "list"],
  admin: ["create", "read", "update", "delete", "list"],
};

const capsList = (c: string[]) => c.map((x) => `"${x}"`).join(", ");

/**
 * Build an ACL policy (HCL) granting `level` on the chosen `paths` within each
 * environment. Paths are de-duplicated and stably ordered. Empty `paths` grants
 * the whole environment.
 */
export function buildAccessPolicy(scope: AccessScope): string {
  const paths = (scope.paths ?? []).map((path) => policyPath(path, true));
  const list = paths.length ? paths : ["*"];

  const blocks: string[] = [];
  const seen = new Set<string>();
  const add = (path: string, caps: string[]) => {
    if (seen.has(path)) return;
    seen.add(path);
    blocks.push(`path "${path}" {\n  capabilities = [${capsList(caps)}]\n}`);
  };

  for (const env of scope.envs) {
    const mount = policyPath(env.mount);
    const suffix = env.envPath === undefined ? "" : `/${policyPath(env.envPath)}`;
    const dataPrefix = `${mount}/data${suffix}`;
    const metaPrefix = `${mount}/metadata${suffix}`;
    for (const p of list) {
      add(`${dataPrefix}/${p}`, DATA_CAPS[scope.level]);
      add(`${metaPrefix}/${p}`, META_CAPS[scope.level]);
    }
  }

  const where = scope.envs
    .map((e) => [policyPath(e.mount), e.envPath === undefined ? undefined : policyPath(e.envPath)].filter(Boolean).join("/"))
    .join(", ");
  const header =
    `# scoped access — level: ${scope.level}, paths: ${list.join(" ")}\n` +
    `# environments: ${where}`;

  return `${header}\n${blocks.join("\n")}\n`;
}
