import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  body: ReactNode;
  action?: { href: string; label: string };
};

/**
 * データがまだ無いときの表示。架空の数字やサンプルデータは出さず、
 * 「何が無いのか」と「次に何をすればいいか」だけを伝える。
 */
export function EmptyState({ title, body, action }: Props) {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="max-w-prose text-sm leading-relaxed text-muted-foreground">{body}</div>
      {action && (
        <Link
          href={action.href}
          className="mt-1 inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
