import type { AccessLevel } from "@/lib/access-policy";

export type EnvSelector =
  | { kind: "mounts"; mounts: string[] }
  | { kind: "folders"; mount: string; folders: string[] };

export type AccessRole = {
  name: string;
  description?: string;
  level: AccessLevel;
  env: EnvSelector;
  paths: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isEnvSelector(value: unknown): value is EnvSelector {
  if (!isRecord(value)) return false;
  if (value.kind === "mounts") return isStringArray(value.mounts);
  return value.kind === "folders" && typeof value.mount === "string" && isStringArray(value.folders);
}

export function isAccessRole(value: unknown): value is AccessRole {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    (value.level === "viewer" || value.level === "editor" || value.level === "admin") &&
    isEnvSelector(value.env) &&
    isStringArray(value.paths)
  );
}
