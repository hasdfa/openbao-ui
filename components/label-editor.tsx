"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogCancel, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { useSetLabel, type Label, type LabelScope } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Friendly-name colors. Kept as named tokens (not raw classes) so they can be
// rendered consistently as dots/badges across the app via colorDot().
export const LABEL_COLORS = [
  "slate",
  "emerald",
  "amber",
  "red",
  "blue",
  "violet",
  "pink",
] as const;

const DOTS: Record<string, string> = {
  slate: "bg-slate-400",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

export function colorDot(color: string | null | undefined): string {
  // hex custom colors are rendered via colorStyle() inline; named tokens map to
  // a Tailwind bg class; anything unknown falls back to a neutral dot.
  if (color && color.startsWith("#")) return "";
  return (color && DOTS[color]) || "bg-muted-foreground/40";
}

/** Inline style for a custom hex color (named tokens use colorDot's class). */
export function colorStyle(
  color: string | null | undefined,
): React.CSSProperties | undefined {
  return color && color.startsWith("#") ? { backgroundColor: color } : undefined;
}

/** A color dot that handles both named tokens and custom hex values. */
export function ColorDot({
  color,
  className,
}: {
  color: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn("rounded-full", colorDot(color), className)}
      style={colorStyle(color)}
    />
  );
}

const CUSTOM_RAINBOW =
  "conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ec4899, #ef4444)";

/**
 * Pick a color: named-token presets plus a native custom picker. Selection is
 * shown with a ring so it's unambiguous which swatch is active.
 */
export function ColorPicker({
  value,
  onChange,
  allowNone = false,
}: {
  value: string;
  onChange: (color: string) => void;
  allowNone?: boolean;
}) {
  const isPreset = value === "" || (LABEL_COLORS as readonly string[]).includes(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNone ? (
        <button
          type="button"
          onClick={() => onChange("")}
          title="No color"
          aria-label="No color"
          aria-pressed={value === ""}
          className={cn(
            "flex size-7 items-center justify-center rounded-full border",
            value === "" && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          )}
        >
          <span className="size-3.5 rounded-full bg-muted-foreground/40" />
        </button>
      ) : null}
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          aria-label={c}
          aria-pressed={value === c}
          className={cn(
            "flex size-7 items-center justify-center rounded-full border",
            value === c && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          )}
        >
          <ColorDot color={c} className="size-4" />
        </button>
      ))}
      {/* custom color — native picker behind a swatch */}
      <label
        title="Custom color"
        className={cn(
          "relative flex size-7 cursor-pointer items-center justify-center rounded-full border",
          !isPreset && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        )}
      >
        <span
          className="size-4 rounded-full"
          style={{ background: isPreset ? CUSTOM_RAINBOW : value }}
        />
        <input
          type="color"
          aria-label="Custom color"
          value={isPreset ? "#3b82f6" : value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

export function LabelEditor({
  open,
  onClose,
  scope,
  refPath,
  current,
  ns,
  nativeName,
}: {
  open: boolean;
  onClose: () => void;
  scope: LabelScope;
  refPath: string;
  current?: Label;
  /** namespace to store under; pass "" for workspace (namespace) labels */
  ns?: string;
  nativeName: string;
}) {
  const set = useSetLabel(ns);
  const [label, setLabel] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("");

  // Re-seed the form whenever the dialog opens for a (possibly different) ref.
  React.useEffect(() => {
    if (!open) return;
    setLabel(current?.label ?? "");
    setDescription(current?.description ?? "");
    setColor(current?.color ?? "");
  }, [open, current]);

  if (!open) return null;

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader
        title="Customize display"
        description={
          <>
            Friendly naming for{" "}
            <span className="font-mono text-foreground">{nativeName}</span>. This
            only changes how it appears in this UI.
          </>
        }
        onClose={onClose}
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await set.mutateAsync({
            scope,
            ref: refPath,
            label,
            description,
            color,
          });
          onClose();
        }}
      >
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="lbl-name">Display name</FieldLabel>
          <Input
            id="lbl-name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={nativeName}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="lbl-desc">Description</FieldLabel>
          <Input
            id="lbl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — what this is for"
          />
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>Color</FieldLabel>
          <ColorPicker value={color} onChange={setColor} allowNone />
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <DialogCancel onClose={onClose} />
          <Button type="submit" disabled={set.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
