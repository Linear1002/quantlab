import {
  Blocks,
  ChartCandlestick,
  ChartLine,
  History,
  LayoutDashboard,
  type LucideIcon,
  Play,
  Settings,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** ページ上部に出す1行の説明 */
  description: string;
};

// サイドバーとモバイルメニューの両方がこの配列を使う(表示順 = 配列の順)
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "ダッシュボード",
    icon: LayoutDashboard,
    description: "選択中の検証内容と、最近のバックテストを確認します。",
  },
  {
    href: "/stocks",
    label: "銘柄",
    icon: ChartCandlestick,
    description: "分析する日本株・米国株を検索して選びます。",
  },
  {
    href: "/strategies",
    label: "戦略",
    icon: Blocks,
    description: "売買ルールを選び、パラメータを調整します。",
  },
  {
    href: "/backtest",
    label: "バックテスト",
    icon: Play,
    description: "資金・期間・手数料を設定して、過去データで検証します。",
  },
  {
    href: "/results",
    label: "分析結果",
    icon: ChartLine,
    description: "リターン・リスク指標と取引履歴を確認します。",
  },
  {
    href: "/history",
    label: "履歴",
    icon: History,
    description: "過去に実行したバックテストを一覧で確認し、再表示します。",
  },
  {
    href: "/settings",
    label: "設定",
    icon: Settings,
    description: "表示の配色、データのキャッシュ、このブラウザに保存した設定を管理します。",
  },
];

/** 現在のパスがナビ項目に該当するか(/results/123 は「分析結果」に該当) */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => isActive(pathname, item.href));
}
