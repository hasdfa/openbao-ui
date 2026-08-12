"use client";

import { ExternalLink } from "lucide-react";

import { Logo } from "@/components/logo";
import { BUILD_REVISION, REPOSITORY_URL } from "@/lib/build-info";
import { useSealStatus } from "@/lib/system";

const LINKS = [
  { label: "OpenBao documentation", href: "https://openbao.org/docs/" },
  { label: "OpenBao API", href: "https://openbao.org/api-docs/" },
  { label: "Brand guidelines", href: "https://openbao.org/community/policies/brand" },
];

export default function AboutPage() {
  const seal = useSealStatus();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-xl border p-8">
        <Logo variant="vertical" className="mx-auto mb-6 h-24 w-auto" />
        <dl className="mx-auto grid max-w-sm grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">OpenBao</dt>
          <dd className="font-mono">{seal.data?.version ?? "…"}</dd>
          <dt className="text-muted-foreground">Seal type</dt>
          <dd className="font-mono">{seal.data?.type ?? "…"}</dd>
          <dt className="text-muted-foreground">UI</dt>
          <dd className="font-mono">openbao-ui 0.1.0</dd>
          <dt className="text-muted-foreground">Build</dt>
          <dd className="font-mono" data-testid="build-revision">{BUILD_REVISION}</dd>
        </dl>

        <div className="mt-6 flex flex-col items-center gap-1">
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Source repository <ExternalLink className="size-3" />
          </a>
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {l.label} <ExternalLink className="size-3" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
