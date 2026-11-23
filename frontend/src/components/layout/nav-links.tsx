"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Props = {
  /** リンクを押したときに呼ぶ(モバイルメニューを閉じるため) */
  onNavigate?: () => void;
  /** 選択中マーカーのアニメーションを区別するためのID(サイドバーとモバイルで別にする) */
  layoutId: string;
};

/** サイドバーとモバイルメニューで共通のナビゲーションリンク一覧 */
export function NavLinks({ onNavigate, layoutId }: Props) {
  const pathname = usePathname();

  return (
    <nav aria-label="メインメニュー">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {active && (
                  // 選択中の項目の左端に出る縦線。ページを移動すると滑らかに移動する
                  <motion.span
                    layoutId={layoutId}
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className={cn("size-4", active ? "text-cyan" : "text-faint")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
