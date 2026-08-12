"use client";

import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { useCan } from "@/lib/acl";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const can = useCan();

  const TABS = [
    { href: "/settings", label: "Profile", show: true },
    { href: "/settings/preferences", label: "Preferences", show: true },
    { href: "/settings/login", label: "Login Page", show: can("sys/mounts") },
    { href: "/settings/namespaces", label: "Namespaces", show: can("sys/namespaces") },
    { href: "/settings/password-policies", label: "Password Policies", show: can("sys/policies/password") },
    { href: "/settings/server", label: "Server", show: can("sys/config/state/sanitized") },
    { href: "/settings/about", label: "About", show: true },
  ].filter((t) => t.show);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 pt-5 sm:px-8 sm:pt-8">
        <PageHeader
          title="Settings"
          description="Your profile, UI preferences, namespaces, and server configuration."
          className="mb-4"
        />
        <SectionTabs tabs={TABS} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
