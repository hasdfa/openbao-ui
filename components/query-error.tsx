import { Lock, TriangleAlert } from "lucide-react";

import { BaoError } from "@/lib/bao-client";
import { cn } from "@/lib/utils";

/**
 * A failed read, stated as what it is. A 403 must never pass for "nothing
 * here": the operator needs to know the list exists but their token can't see it.
 */
export function QueryError({
  error,
  what,
  className,
}: {
  error: unknown;
  /** What was being read, e.g. "auth methods" → "Your token can't read auth methods here." */
  what: string;
  className?: string;
}) {
  const denied = error instanceof BaoError && error.status === 403;
  const detail =
    error instanceof BaoError ? error.errors.join(", ") : error instanceof Error ? error.message : null;
  const Icon = denied ? Lock : TriangleAlert;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
        denied ? "border-border bg-muted/40" : "border-destructive/40 text-destructive",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", denied && "text-muted-foreground")} />
      <div className="min-w-0">
        <p className="font-medium">
          {denied ? `Your token can't read ${what} here.` : `Couldn't load ${what}.`}
        </p>
        {denied ? (
          <p className="text-muted-foreground">Ask an admin for a policy that grants read or list on it.</p>
        ) : detail ? (
          <p className="break-words opacity-80">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}
