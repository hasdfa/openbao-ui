"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";
import { readHttpEnvelope } from "@/lib/http/client";

import { useNamespace } from "@/lib/namespace";

// Client access to per-namespace onboarding progress (/ui2/api/onboarding).
export type Onboarding = { dismissed?: boolean; steps?: Record<string, boolean> };

export function useOnboarding() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["onboarding", namespace],
    queryFn: async (): Promise<Onboarding> => {
      const response = await fetch(`${API_BASE}/onboarding`, {
        headers: { "x-vault-namespace": namespace },
      });
      const data = await readHttpEnvelope<{ onboarding: Onboarding }>(response);
      return data.onboarding;
    },
    staleTime: 30_000,
  });
}

export function useSetOnboarding() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    mutationFn: async (patch: Onboarding) => {
      const response = await fetch(`${API_BASE}/onboarding`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-vault-namespace": namespace,
        },
        body: JSON.stringify(patch),
      });
      return readHttpEnvelope<{ onboarding: Onboarding }>(response);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding", namespace] }),
  });
}
