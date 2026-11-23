import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  /** 右側に置くボタンなど */
  actions?: ReactNode;
};

/** 各ページの見出し。h1 はページごとに1つだけ */
export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
