// Standard role templates — the catalog the Team view seeds with. A role is a
// named (policy + group) bundle: applying a template writes the ACL policy and
// creates an internal identity group that carries it, so assigning the role to
// a member is just group membership. Plain module (no "use client") so the BFF
// route and client code can both import it.

export type RoleTemplate = {
  name: string; // also the policy + group name
  description: string;
  color: string; // a LABEL_COLORS token (see components/label-editor)
  policy: string; // ACL policy HCL
};

export function isRoleTemplate(value: unknown): value is RoleTemplate {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const template = value as Record<string, unknown>;
  return (
    typeof template.name === "string" &&
    typeof template.description === "string" &&
    typeof template.color === "string" &&
    typeof template.policy === "string"
  );
}

export const DEFAULT_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: "admin",
    description: "Full administrative access to everything in this workspace.",
    color: "red",
    policy: `# Full administrative access
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
`,
  },
  {
    name: "editor",
    description: "Read and write application secrets.",
    color: "blue",
    policy: `# Read/write application secrets
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "sys/mounts" {
  capabilities = ["read"]
}
`,
  },
  {
    name: "viewer",
    description: "Read-only access to application secrets.",
    color: "slate",
    policy: `# Read-only access to application secrets
path "secret/*" {
  capabilities = ["read", "list"]
}
path "sys/mounts" {
  capabilities = ["read"]
}
`,
  },
];
