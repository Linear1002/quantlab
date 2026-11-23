"use client";

import type { Interval } from "@/lib/api";
import { toIsoDate, yearsAgo } from "@/lib/format";
import type { Period } from "@/lib/store";
import { cn } from "@/lib/utils";

const PRESETS = [1, 3, 5, 10];
const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1d", label: "日足" },
  { value: "1wk", label: "週足" },
];

type Props = {
  period: Period;
  interval: Interval;
  onPeriod: (p: Period) => void;
  onInterval: (i: Interval) => void;
};

/** 分析期間(1年/3年/5年/10年/日付指定)と時間軸(日足/週足)の選択 */
export function PeriodControls({ period, interval, onPeriod, onInterval }: Props) {
  const today = toIsoDate(new Date());

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Segmented label="分析期間">
        {PRESETS.map((y) => (
          <SegButton
            key={y}
            selected={period.preset === y}
            onClick={() => onPeriod({ start: yearsAgo(y), end: today, preset: y })}
          >
            {y}年
          </SegButton>
        ))}
      </Segmented>

      <div className="flex items-center gap-2 text-sm">
        <DateInput
          label="開始日"
          value={period.start}
          max={period.end}
          onChange={(start) => onPeriod({ ...period, start, preset: null })}
        />
        <span className="text-faint">〜</span>
        <DateInput
          label="終了日"
          value={period.end}
          min={period.start}
          max={today}
          onChange={(end) => onPeriod({ ...period, end, preset: null })}
        />
      </div>

      <Segmented label="時間軸">
        {INTERVALS.map((i) => (
          <SegButton key={i.value} selected={interval === i.value} onClick={() => onInterval(i.value)}>
            {i.label}
          </SegButton>
        ))}
      </Segmented>
    </div>
  );
}

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line p-0.5">
      {children}
    </div>
  );
}

function SegButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "h-7 rounded-[5px] px-3 text-xs transition-colors",
        selected ? "bg-blue text-white" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      // 入力途中の不完全な値(空文字)では更新しない
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="h-8 rounded-md border border-input bg-panel px-2 text-sm text-foreground [color-scheme:dark] focus:border-blue focus:outline-none"
    />
  );
}
