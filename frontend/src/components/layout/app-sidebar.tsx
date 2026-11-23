import Link from "next/link";
import { NavLinks } from "./nav-links";

/** PC 用のサイドバー(md 以上で表示)。スマホでは MobileNav を使う */
export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <Brand />
      <div className="mt-8">
        <NavLinks layoutId="sidebar-active" />
      </div>
      <p className="mt-auto px-3 text-xs leading-relaxed text-faint">
        データ: Yahoo Finance
      </p>
    </aside>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3">
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight text-foreground">QuantLab</span>
    </Link>
  );
}

/** ロゴマーク: 資産曲線とドローダウン(ピークからの下落)を1本の線で表したもの */
function BrandMark() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <rect width="20" height="20" rx="5" fill="var(--panel)" />
      <path
        d="M4 14.5 L8 9.5 L10.5 11.5 L16 5.5"
        fill="none"
        stroke="var(--cyan)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 11.5 V15.5" stroke="var(--purple)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
