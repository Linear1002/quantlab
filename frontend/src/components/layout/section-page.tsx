import type { ComponentProps } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { NAV_ITEMS } from "@/lib/nav";
import { PageHeader } from "./page-header";

type Props = {
  href: string;
  panelTitle: string;
  empty: ComponentProps<typeof EmptyState>;
};

/**
 * まだ中身が無い画面の共通レイアウト(見出し + 空の状態)。
 * 各 Phase で機能を実装したら、ページ側でこのコンポーネントを使うのをやめる。
 */
export function SectionPage({ href, panelTitle, empty }: Props) {
  const nav = NAV_ITEMS.find((n) => n.href === href);
  if (!nav) throw new Error(`Unknown nav href: ${href}`);
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <Panel title={panelTitle}>
        <EmptyState {...empty} />
      </Panel>
    </div>
  );
}
