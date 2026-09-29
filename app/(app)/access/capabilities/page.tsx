"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError } from "@/lib/bao-client";
import { useCapabilities } from "@/lib/access";

export default function CapabilitiesPage() {
  const [path, setPath] = React.useState("secret/data/");
  const check = useCapabilities();

  const result = check.data?.[path.trim()];

  return (
    <div className="max-w-2xl px-4 py-6 md:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Capabilities tester</CardTitle>
          <CardDescription>
            Check what your current token is allowed to do on a path
            (sys/capabilities-self).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (path.trim()) check.mutate([path.trim()]);
            }}
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="cap-path">Path</Label>
              <Input
                id="cap-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="font-mono"
                placeholder="secret/data/myapp/config"
              />
            </div>
            <Button type="submit" disabled={check.isPending}>
              {check.isPending ? "Checking…" : "Check"}
            </Button>
          </form>

          {check.isError ? (
            <p className="mt-4 text-sm text-destructive">
              {check.error instanceof BaoError
                ? check.error.errors.join(", ")
                : "Failed"}
            </p>
          ) : null}

          {result ? (
            <div className="mt-6">
              <div className="mb-2 text-sm text-muted-foreground">
                Capabilities on{" "}
                <span className="font-mono text-foreground">{path.trim()}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.map((c) => (
                  <span
                    key={c}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      c === "deny"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
