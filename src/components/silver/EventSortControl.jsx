import React from "react";

export const SORT_OPTIONS = [
  { value: "prominence", label: "Prominence" },
  { value: "date_desc",  label: "Date ↓" },
  { value: "date_asc",   label: "Date ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "price_asc",  label: "Price ↑" },
  { value: "peaks_first", label: "Peaks first" },
  { value: "dips_first",  label: "Dips first" },
];

/**
 * Sort a list of events (each has .date, .close, .prominence, .eventType).
 */
export function sortEvents(events, sortOrder, analyses) {
  const CONF_RANK = { high: 0, medium: 1, low: 2 };
  const arr = [...events];
  switch (sortOrder) {
    case "date_desc":
      return arr.sort((a, b) => b.date.localeCompare(a.date));
    case "date_asc":
      return arr.sort((a, b) => a.date.localeCompare(b.date));
    case "price_desc":
      return arr.sort((a, b) => (b.close ?? 0) - (a.close ?? 0));
    case "price_asc":
      return arr.sort((a, b) => (a.close ?? 0) - (b.close ?? 0));
    case "peaks_first":
      return arr.sort((a, b) => {
        if (a.eventType !== b.eventType) return a.eventType === "peak" ? -1 : 1;
        return b.prominence - a.prominence;
      });
    case "dips_first":
      return arr.sort((a, b) => {
        if (a.eventType !== b.eventType) return a.eventType === "dip" ? -1 : 1;
        return b.prominence - a.prominence;
      });
    case "prominence":
    default: {
      // Original: confidence rank first, then prominence
      return arr.sort((a, b) => {
        const aConf = analyses?.[`${a.date}_${a.eventType}`]?.confidence;
        const bConf = analyses?.[`${b.date}_${b.eventType}`]?.confidence;
        const aRank = aConf != null ? (CONF_RANK[aConf] ?? 3) : 3;
        const bRank = bConf != null ? (CONF_RANK[bConf] ?? 3) : 3;
        if (aRank !== bRank) return aRank - bRank;
        return b.prominence - a.prominence;
      });
    }
  }
}

/**
 * Compact horizontal segmented control for choosing event sort order.
 */
export default function EventSortControl({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
            value === opt.value
              ? "border-amber-500/60 bg-amber-500/15 text-amber-300 font-semibold"
              : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}