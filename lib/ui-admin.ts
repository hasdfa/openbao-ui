/**
 * Server-side gate for writes to the UI metadata store.
 *
 * Labels and UI config are non-secret, but mutating them is an operator action,
 * so we only allow it for tokens that can manage mounts. Mount management may be
 * granted on the list endpoint (`sys/mounts`) or — more commonly for delegated
 * admins — on concrete mount paths (`sys/mounts/*`, since enabling/disabling an
 * engine happens at `sys/mounts/:path`), so we accept either. This keeps the
 * BFF's stateful layer governed by OpenBao's own authorization rather than
 * inventing a parallel permission system.
 */
import { openbao } from "@/lib/openbao";

const ADMIN_CAPS = new Set(["create", "update", "sudo", "root"]);

// Probe the list endpoint, the prefix, and a concrete child so a policy granting
// `sys/mounts/*` or `sys/mounts/+` (delegated mount admin) is recognized too.
const MOUNT_PATHS = ["sys/mounts", "sys/mounts/", "sys/mounts/_ui_probe"];

export async function isOperator(
  token: string,
  namespace?: string,
): Promise<boolean> {
  const res = await openbao.capabilitiesSelf(token, MOUNT_PATHS, namespace);
  const caps = MOUNT_PATHS.flatMap(
    (path) => (res.data?.[path] as string[] | undefined) ?? [],
  );
  return caps.some((capability) => ADMIN_CAPS.has(capability));
}

