import React from "react";
import { Calendar } from "lucide-react";

const MIN_DATE = "1994-01-01";

// Desktop: date range + presets only.
// Sliders, buttons, and structural drivers live in ControlsBottom (below the chart).
export default function Controls({ dateFrom, setDateFrom, dateTo, setDateTo }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const activePreset = (() => {
    if (dateTo !== todayStr) return null;
    if (dateFrom === MIN_DATE) return "Max";
    const presets = [
      { label: "3M", months: 3 },
      { label: "6M", months: 6 },
      { label: "1Y", months: 12 },
      { label: "3Y", months: 36 },
      { label: "5Y", months: 60 },
      { label: "10Y", months: 120 },
      { label: "15Y", months: 180 },
      { label: "20Y", months: 240 },
      { label: "25Y", months: 300 },
      { label: "30Y", months: 360 },
    ];
    for (const { label, months } of presets) {
      const expected = new Date();
      expected.setMonth(expected.getMonth() - months);
      if (dateFrom === expected.toISOString().slice(0, 10)) return label;
    }
    return null;
  })();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Calendar className="h-3.5 w-3.5" /> From
          </label>
          <input
            type="date"
            value={dateFrom}
            min={MIN_DATE}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Calendar className="h-3.5 w-3.5" /> To
          </label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "3M", months: 3 },
            { label: "6M", months: 6 },
            { label: "1Y", months: 12 },
            { label: "3Y", months: 36 },
            { label: "5Y", months: 60 },
            { label: "10Y", months: 120 },
            { label: "15Y", months: 180 },
            { label: "20Y", months: 240 },
            { label: "25Y", months: 300 },
            { label: "30Y", months: 360 },
            { label: "Max", months: null },
          ].map(({ label, months }) => (
            <button
              key={label}
              onClick={() => {
                const to = new Date().toISOString().slice(0, 10);
                setDateTo(to);
                if (months === null) {
                  setDateFrom(MIN_DATE);
                } else {
                  const from = new Date();
                  from.setMonth(from.getMonth() - months);
                  setDateFrom(from.toISOString().slice(0, 10));
                }
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                activePreset === label
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}