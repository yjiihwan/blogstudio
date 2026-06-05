"use client";

import { useState } from "react";
import { pickerToCron, cronToPicker, parseCronToHuman } from "@/lib/cron-utils";
import { Clock } from "lucide-react";

const DAYS = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label:
    i === 0
      ? "자정 (00:00)"
      : i < 12
      ? `오전 ${i}시 (${String(i).padStart(2, "0")}:00)`
      : i === 12
      ? "낮 12시 (12:00)"
      : `오후 ${i - 12}시 (${String(i).padStart(2, "0")}:00)`,
}));

export function SchedulePicker({
  name = "cron",
  defaultValue = "0 7 * * 1",
}: {
  name?: string;
  defaultValue?: string;
}) {
  const initial = cronToPicker(defaultValue);
  const [selectedDays, setSelectedDays] = useState<number[]>(initial.days);
  const [hour, setHour] = useState(initial.hour);

  const cronValue = pickerToCron(selectedDays, hour);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink-600">생성 요일 <span className="font-normal text-ink-400">(여러 개 선택 가능)</span></p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`w-11 h-11 rounded-full text-sm font-bold transition-all touch-manipulation ${
                selectedDays.includes(d.value)
                  ? "bg-accent-500 text-white shadow-sm scale-105"
                  : "bg-paper-100 border border-paper-300 text-ink-500 hover:border-accent-300 hover:text-accent-600"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {selectedDays.length === 0 && (
          <p className="text-[11px] text-amber-600">요일을 하나 이상 선택하세요. 선택하지 않으면 매일 실행됩니다.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink-600">초안 생성 시각</p>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="h-10 w-full max-w-xs rounded-lg border border-paper-300 bg-paper-50 px-3 text-sm focus:border-ink-700 focus:ring-2 focus:ring-ink-700/10 outline-none"
        >
          {HOURS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-accent-50 border border-accent-200/60 px-3 py-2.5 text-sm text-accent-700">
        <Clock className="size-4 shrink-0 text-accent-500" />
        <span><strong>설정 요약:</strong> {parseCronToHuman(cronValue)} 자동 생성</span>
      </div>

      <input type="hidden" name={name} value={cronValue} />
    </div>
  );
}
