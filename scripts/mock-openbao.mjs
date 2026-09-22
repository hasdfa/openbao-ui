#!/usr/bin/env node
// Dependency-free mock of the OpenBao subset the UI uses (KV v2 + mounts + auth).
// FOR LOCAL DEV/VERIFICATION ONLY — not a real OpenBao. Run: node scripts/mock-openbao.mjs
import http from "node:http";

const PORT = process.env.PORT || 8200;
const ROOT_TOKEN = process.env.ROOT_TOKEN || "root";

// In-memory KV v2 store for mount "secret/": path -> { current_version, versions }
const kv = new Map();
const now = () => new Date().toISOString();
kv.set("payments/config", {
  current_version: 1,
  versions: { 1: { data: { owner: "platform" }, created_time: now(), deletion_time: "", destroyed: false } },
});

function send(res, status, body) {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(text);
}
const errors = (res, status, ...msgs) => send(res, status, { errors: msgs });

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// list immediate children of a folder prefix ("" == root) across stored paths
function listKeys(prefix) {
  const p = prefix ? prefix.replace(/\/+$/, "") + "/" : "";
  const keys = new Set();
  for (const full of kv.keys()) {
    if (!full.startsWith(p)) continue;
    const rest = full.slice(p.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    keys.add(slash === -1 ? rest : rest.slice(0, slash + 1));
  }
  return [...keys].sort();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean); // ["v1", ...]
  if (parts[0] !== "v1") return errors(res, 404, "unsupported path");
  const seg = parts.slice(1);
  const token = req.headers["x-vault-token"];
  const path = (n) => seg.slice(n).join("/");

  // --- unauthenticated ---
  if (path(0) === "sys/seal-status") {
    return send(res, 200, {
      type: "shamir",
      initialized: true,
      sealed: false,
      version: "mock-2.0.0",
      cluster_name: "mock",
    });
  }
  if (seg[0] === "auth" && seg[1] === "userpass" && seg[2] === "login") {
    const body = await readBody(req);
    if (body.password === "test")
      return send(res, 200, {
        auth: { client_token: ROOT_TOKEN, policies: ["default"], lease_duration: 3600, renewable: true, metadata: null },
      });
    return errors(res, 400, "invalid username or password");
  }

  // --- everything else requires the root token ---
  if (token !== ROOT_TOKEN) return errors(res, 403, "permission denied");

  if (path(0) === "auth/token/lookup-self") {
    return send(res, 200, {
      data: { display_name: "root", policies: ["root"], ttl: 0, renewable: true, expire_time: null, meta: null },
    });
  }
  if (path(0) === "sys/mounts" || path(0) === "sys/internal/ui/mounts") {
    const secretMount = {
      "secret/": { type: "kv", description: "key/value store", accessor: "kv_mock", options: { version: "2" } },
      "cubbyhole/": { type: "cubbyhole", description: "per-token storage", accessor: "cubbyhole_mock", options: null },
      "identity/": { type: "identity", description: "identity store", accessor: "identity_mock", options: null },
      "sys/": { type: "system", description: "system backend", accessor: "system_mock", options: null },
    };
    if (path(0) === "sys/mounts") return send(res, 200, { data: secretMount });
    return send(res, 200, { data: { secret: secretMount, auth: {} } });
  }
  if (path(0) === "sys/internal/ui/resultant-acl") {
    return send(res, 200, { data: { root: true, exact_paths: {}, glob_paths: {} } });
  }
  if (path(0) === "sys/capabilities-self") {
    return send(res, 200, {
      data: {
        capabilities: ["root"],
        "sys/capabilities-self": ["root"],
        "sys/mounts": ["root"],
        "sys/mounts/": ["root"],
        "sys/mounts/_ui_probe": ["root"],
      },
    });
  }
  if (path(0) === "sys/namespaces") return send(res, 200, { data: { keys: [] } });

  // --- KV v2 under mount "secret/" ---
  if (seg[0] === "secret") {
    const op = seg[1]; // data | metadata | delete | undelete | destroy
    const key = seg.slice(2).join("/");
    const body = ["GET", "DELETE"].includes(req.method) ? {} : await readBody(req);

    if (op === "metadata") {
      if (url.searchParams.get("list") === "true" || req.method === "LIST") {
        const ks = listKeys(key);
        if (key && ks.length === 0) return errors(res, 404, "not found");
        return send(res, 200, { data: { keys: ks } });
      }
      if (req.method === "DELETE") {
        kv.delete(key);
        return send(res, 204);
      }
      const e = kv.get(key);
      if (!e) return errors(res, 404, "not found");
      const versions = {};
      for (const [v, d] of Object.entries(e.versions))
        versions[v] = { created_time: d.created_time, deletion_time: d.deletion_time, destroyed: d.destroyed };
      return send(res, 200, {
        data: { current_version: e.current_version, oldest_version: 1, max_versions: 0, cas_required: false, custom_metadata: null, created_time: e.versions["1"].created_time, updated_time: e.versions[e.current_version].created_time, versions },
      });
    }

    if (op === "data") {
      if (req.method === "GET") {
        const e = kv.get(key);
        if (!e) return errors(res, 404, "not found");
        const vNum = Number(url.searchParams.get("version")) || e.current_version;
        const v = e.versions[vNum];
        if (!v) return errors(res, 404, "version not found");
        return send(res, 200, {
          data: { data: v.destroyed || v.deletion_time ? null : v.data, metadata: { version: vNum, created_time: v.created_time, deletion_time: v.deletion_time, destroyed: v.destroyed, custom_metadata: null } },
        });
      }
      if (req.method === "POST" || req.method === "PUT") {
        const e = kv.get(key);
        const cur = e ? e.current_version : 0;
        const cas = body.options?.cas;
        if (cas !== undefined && cas !== cur)
          return errors(res, 400, "check-and-set parameter did not match the current version");
        const next = cur + 1;
        const entry = e ?? { current_version: 0, versions: {} };
        entry.versions[next] = { data: body.data ?? {}, created_time: now(), deletion_time: "", destroyed: false };
        entry.current_version = next;
        kv.set(key, entry);
        return send(res, 200, { data: { version: next, created_time: entry.versions[next].created_time, deletion_time: "", destroyed: false } });
      }
      if (req.method === "DELETE") {
        const e = kv.get(key);
        if (e) { const v = e.versions[e.current_version]; if (v) v.deletion_time = now(); }
        return send(res, 204);
      }
    }

    if (["delete", "undelete", "destroy"].includes(op)) {
      const e = kv.get(key);
      if (!e) return errors(res, 404, "not found");
      for (const vNum of body.versions ?? []) {
        const v = e.versions[vNum];
        if (!v) continue;
        if (op === "delete") v.deletion_time = now();
        if (op === "undelete") v.deletion_time = "";
        if (op === "destroy") { v.destroyed = true; v.data = null; }
      }
      return send(res, 204);
    }
  }

  return errors(res, 404, "mock: unhandled path " + url.pathname);
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`[mock-openbao] listening on http://127.0.0.1:${PORT} (token: ${ROOT_TOKEN})`),
);
