import { open, readFile, stat } from "node:fs/promises";

import {
  asJsonResponse,
  Dependency,
  forbidden,
  serviceUnavailable,
  success,
  unauthorized,
} from "@/lib/http/response";
import { OpenBaoRequestError } from "@/lib/openbao";
import { getValidatedToken } from "@/lib/session";
import { isOperator } from "@/lib/ui-admin";
import { parseAuditLog } from "@/lib/audit-parse";

const AuditLogPath = process.env.AUDIT_LOG_PATH ?? "/bao/file/audit.log";
const MaxAuditReadBytes = 512 * 1024;

async function readRecentAuditLog(): Promise<string> {
  const { size } = await stat(AuditLogPath);
  if (size <= MaxAuditReadBytes) return readFile(AuditLogPath, "utf8");
  const file = await open(AuditLogPath, "r");
  try {
    const buffer = Buffer.alloc(MaxAuditReadBytes);
    await file.read(buffer, 0, MaxAuditReadBytes, size - MaxAuditReadBytes);
    const content = buffer.toString("utf8");
    const firstLineEnd = content.indexOf("\n");
    return firstLineEnd >= 0 ? content.slice(firstLineEnd + 1) : content;
  } finally {
    await file.close();
  }
}
function isMissingAuditLog(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function GET() {
  let token: string | undefined;
  try {
    token = await getValidatedToken();
  } catch (error) {
    if (error instanceof OpenBaoRequestError)
      return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
    throw error;
  }
  if (!token) return asJsonResponse(unauthorized());

  try {
    if (!(await isOperator(token))) return asJsonResponse(forbidden());
  } catch (error) {
    if (error instanceof OpenBaoRequestError)
      return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
    throw error;
  }

  try {
    return asJsonResponse(
      success({
        available: true,
        records: parseAuditLog(await readRecentAuditLog()),
      }),
    );
  } catch (error) {
    if (isMissingAuditLog(error))
      return asJsonResponse(success({ available: false, records: [] }));
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}
