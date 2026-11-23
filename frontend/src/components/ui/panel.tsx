import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 情報のまとまりを囲む面。影は使わず、1px の罫線と背景色の差で区切る。
 * title を渡すと上部に見出しを出す。
 */
export function Panel({
  title,
  aside,
  className,
  children,
  ...props
}: ComponentProps<"section"> & { title?: string; aside?: ReactNode }) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-navy", className)}
      aria-label={title}
      {...props}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
