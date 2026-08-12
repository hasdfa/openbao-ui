import type { AccessLevel } from "@/lib/access-policy";
import { isEnvSelector, type EnvSelector } from "@/lib/access-role-schema";

export type AppCredential = {
  app: string;
  level: AccessLevel;
  env: EnvSelector;
  mount: string;
  ttl?: string;
  paths: string[];
  roles: { env: string; role: string; policy: string }[];
  createdAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isMaterializedRole(value: unknown): boolean {
  return isRecord(value) && typeof value.env === "string" && typeof value.role === "string" && typeof value.policy === "string";
}

export function isAppCredential(value: unknown): value is AppCredential {
  if (!isRecord(value) || "secretId" in value || "roleId" in value) return false;
  return typeof value.app === "string" &&
    (value.level === "viewer" || value.level === "editor" || value.level === "admin") &&
    isEnvSelector(value.env) && typeof value.mount === "string" &&
    (value.ttl === undefined || typeof value.ttl === "string") &&
    isStringArray(value.paths) && Array.isArray(value.roles) && value.roles.every(isMaterializedRole) &&
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt);
}
