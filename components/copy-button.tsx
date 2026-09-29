"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Both icons stay mounted and crossfade; the blur hides the moment they overlap.
const ICON = "transition-[opacity,transform,filter] duration-200 ease-out";
const HIDDEN = "scale-50 opacity-0 blur-[2px]";

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
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
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
      aria-label={label ? undefined : "Copy"}
    >
      <span className="relative inline-flex">
        <Copy className={cn(ICON, copied && HIDDEN)} />
        <Check className={cn(ICON, "absolute inset-0 text-emerald-500", !copied && HIDDEN)} />
      </span>
      {label}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </Button>
  );
}
