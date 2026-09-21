"use client";

import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, BASE_PATH } from "@/lib/base-path";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const client = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
      if (!res.ok) {
        // Non-2xx: don't navigate away on a failed logout — re-enable the
        // button so the user can retry instead of being stuck disabled.
        setLoading(false);
        return;
      }
      await client.cancelQueries();
      client.clear();
      window.location.replace(`${BASE_PATH}/login`);
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
