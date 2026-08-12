"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";

import { readHttpEnvelope } from "@/lib/http/client";
import type { AuditRecord } from "@/lib/audit-parse";
import { usePreferences } from "@/lib/preferences";

export type { AuditRecord };

export function useAuditLog() {
  const { prefs } = usePreferences();
  return useQuery({
    queryKey: ["audit-log"],
    queryFn: async (): Promise<{
      available: boolean;
      records: AuditRecord[];
    }> => {
      const response = await fetch(`${API_BASE}/audit`);
      return readHttpEnvelope<{ available: boolean; records: AuditRecord[] }>(
        response,
      );
    },
    refetchInterval: prefs.auditRefreshMs > 0 ? prefs.auditRefreshMs : false,
  });
}
