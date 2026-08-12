"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";
import { readHttpEnvelope } from "@/lib/http/client";

// Client access to UI configuration (/ui2/api/ui-config). Phase 1 wires the
// plumbing; Phase 2 (login customization) populates branding / default method.

/**
 * Browser-side OIDC callback URL used when registering a role's
 * allowed_redirect_uris. Prefers the server's OPENBAO_UI_PUBLIC_URL override
 * (echoed into ui-config as `publicUrl`) over window.location.origin, so setup
 * registers the exact redirect URI the login route will later send.
 */
export function oidcCallbackUrl(publicUrl?: string): string {
  const origin =
    publicUrl?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}${API_BASE}/auth/oidc/callback`;
}

export type UiConfig = {
  branding?: {
    title?: string;
    subtitle?: string;
    logoUrl?: string;
    accent?: string;
  };
  defaultLoginMethod?: string;
  hideTokenLogin?: boolean;
  loginMethodOrder?: string[];
  /** Read-only echo of the OPENBAO_UI_PUBLIC_URL env override, when set. Lets
   *  client-side OIDC setup register the same redirect origin the server uses. */
  publicUrl?: string;
};

export function useUiConfig() {
  return useQuery({
    queryKey: ["ui-config"],
    queryFn: async (): Promise<UiConfig> => {
      const response = await fetch(`${API_BASE}/ui-config`);
      const data = await readHttpEnvelope<{ config: UiConfig }>(response);
      return data.config;
    },
    staleTime: 60_000,
  });
}

export function useSetUiConfig() {
  const qc = useQueryClient();
  return useMutation({
    meta: { success: "Settings saved" },
    mutationFn: async (patch: UiConfig) => {
      const response = await fetch(`${API_BASE}/ui-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      return readHttpEnvelope<{ config: UiConfig }>(response);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ui-config"] }),
  });
}
