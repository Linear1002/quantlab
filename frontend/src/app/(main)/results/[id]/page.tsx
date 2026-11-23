import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { SavedResult } from "@/components/results/saved-result";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "分析結果" };

const nav = NAV_ITEMS.find((n) => n.href === "/results")!;

// ID はリクエストのときにしか分からないので、Suspense の中で読む(Next.js 16 の Cache Components の決まり)
export default function SavedResultPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="space-y-8">
      <PageHeader title={nav.label} description={nav.description} />
      <Suspense fallback={<p className="text-sm text-muted-foreground">結果を読み込んでいます</p>}>
        {params.then(({ id }) => (
          <SavedResult id={id} />
        ))}
      </Suspense>
    </div>
  );
}
