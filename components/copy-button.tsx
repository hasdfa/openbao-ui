"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  /** Size overrides for tight contexts, e.g. beside small mono text. */
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — ignore silently
    }
  }

  return (
    <Button
      variant="ghost"
      size={label ? "sm" : "icon"}
      className={className}
      onClick={copy}
      title="Copy"
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
      {label}
    </Button>
  );
}
