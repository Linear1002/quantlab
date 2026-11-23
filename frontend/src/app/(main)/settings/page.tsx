import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "設定" };

const nav = NAV_ITEMS.find((n) => n.href === "/settings")!;

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <SettingsView />
    </div>
  );
}
