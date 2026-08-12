"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { API_BASE } from "@/lib/base-path";
import { HttpClientError, readHttpEnvelope } from "@/lib/http/client";
import { HttpErrorCode } from "@/lib/http/response";

export type Session = {
  displayName: string;
  policies: string[];
  ttl: number;
  renewable: boolean;
};

const SessionQueryKey = ["session"] as const;

async function fetchSession(): Promise<Session | null> {
  const response = await fetch(`${API_BASE}/auth/session`);
  try {
    return await readHttpEnvelope<Session>(response);
  } catch (error) {
    if (error instanceof HttpClientError && error.code === HttpErrorCode.Unauthenticated) {
      return null;
    }
    throw error;
  }
}

async function renewSession(): Promise<{ ttl: number }> {
  const response = await fetch(`${API_BASE}/auth/renew`, { method: "POST" });
  return readHttpEnvelope<{ ttl: number }>(response);
}

export function useSession() {
  return useQuery({
    queryKey: SessionQueryKey,
    queryFn: fetchSession,
    refetchInterval: 60_000,
  });
}

export function useRenew() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { success: "Token renewed" },
    mutationFn: renewSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SessionQueryKey }),
  });
}
