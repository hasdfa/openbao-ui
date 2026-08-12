"use client";

import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { useCan } from "@/lib/acl";

export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const can = useCan();

  const TABS = [
    { href: "/operations", label: "Status", show: true },
    { href: "/operations/audit", label: "Audit", show: can("sys/audit") },
    { href: "/operations/quotas", label: "Quotas", show: can("sys/quotas/rate-limit") },
    { href: "/operations/plugins", label: "Plugins", show: can("sys/plugins/catalog") },
  ].filter((t) => t.show);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 pt-5 sm:px-8 sm:pt-8">
        <PageHeader
          title="Operations"
          description="System status, audit, quotas, and plugins."
          className="mb-4"
        />
        <SectionTabs tabs={TABS} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
