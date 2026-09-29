"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogCancel, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Guardrail for destructive actions. When `confirmText` is set the user must
 * type it to enable the action (typed-confirm), per the roadmap's safety rules.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  confirmText,
  destructive = true,
  pending = false,
  warning,
  error,
}: {
  open: boolean;
  onClose: () => void;
  /** May be async; a rejection is swallowed here, so surface it via `error`. */
  onConfirm: () => void | Promise<unknown>;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmText?: string;
  destructive?: boolean;
  pending?: boolean;
  warning?: React.ReactNode;
  error?: string | null;
}) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const blocked = !!confirmText && typed !== confirmText;

  // Callers usually derive the copy from the item being deleted and clear it on
  // close; keep the last open copy so the exit doesn't flash blank text.
  const [last, setLast] = React.useState({ title, description });
  if (open && (last.title !== title || last.description !== description)) {
    setLast({ title, description });
  }

  return (
    // A running request must not be dismissed out from under the user.
    <Dialog open={open} onClose={onClose} dismissible={!pending}>
      <DialogHeader
        title={open ? title : last.title}
        description={open ? description : last.description}
        onClose={onClose}
      />
      {warning ? (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {warning}
        </div>
      ) : null}
      {confirmText ? (
        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="confirm-input">
            Type <span className="font-mono font-semibold">{confirmText}</span>{" "}
            to confirm
          </Label>
          <Input
            id="confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !blocked && !pending) {
                e.preventDefault();
                Promise.resolve(onConfirm()).catch(() => {});
              }
            }}
            autoComplete="off"
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>
      ) : null}
      {/* A form, so Enter confirms once the typed check passes. */}
      <form
        className="flex justify-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (blocked || pending) return;
          Promise.resolve(onConfirm()).catch(() => {});
        }}
      >
        <DialogCancel onClose={onClose} disabled={pending} />
        <Button
          type="submit"
          variant={destructive ? "destructive" : "default"}
          disabled={blocked || pending}
        >
          {pending ? "Working…" : confirmLabel}
        </Button>
      </form>
    </Dialog>
  );
}
