"use client";

import { LogOut } from "lucide-react";
import { API_BASE } from "@/lib/base-path";
import { readHttpEnvelope } from "@/lib/http/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
      await readHttpEnvelope<Record<never, never>>(response);
      router.push("/login");
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground"
      onClick={logout}
      disabled={loading}
    >
      <LogOut />
      Sign out
    </Button>
  );
}
