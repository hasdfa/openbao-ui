"use client";

import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { useCan } from "@/lib/acl";

export default function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const can = useCan();

  const TABS = [
    { href: "/access", label: "Policies", show: can("sys/policies/acl") },
    { href: "/access/auth", label: "Auth Methods", show: can("sys/auth") },
    { href: "/access/app-credentials", label: "App credentials", show: can("sys/auth") },
    { href: "/access/team", label: "Team", show: can("identity/group/id") },
    { href: "/access/identity", label: "Identity", show: can("identity/entity/id") },
    { href: "/access/mfa", label: "MFA", show: can("identity/mfa/method/totp") },
    { href: "/access/capabilities", label: "Capabilities", show: true },
    { href: "/access/tokens", label: "Tokens", show: can("auth/token/accessors") },
    { href: "/access/leases", label: "Leases", show: can("sys/leases/lookup") },
  ].filter((t) => t.show);

  return (
    <div className="flex h-full flex-col">
      <header className="min-w-0 border-b px-4 pt-5 sm:px-8 sm:pt-8">
        <PageHeader
          title="Access"
          description="Policies, capabilities, tokens, and leases."
          className="mb-4"
        />
        <SectionTabs tabs={TABS} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
