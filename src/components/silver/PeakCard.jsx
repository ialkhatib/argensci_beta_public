import React from "react";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Loader2, ChevronRight, ExternalLink, X } from "lucide-react";

const CONF_STYLES = {
  high: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  low: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const LIKE_STYLES = {
  high: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  low: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

export default function PeakCard({ point, type, analysis, loading, onDetailsClick, onCancelLoading }) {
  const isPeak = type === "peak";
  const dateLabel = new Date(point.date).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className={`rounded-2xl border bg-white/[0.03] backdrop-blur-xl p-5 transition-colors ${isPeak ? "border-white/10 hover:border-amber-400/30" : "border-white/10 hover:border-sky-400/30"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`flex items-center gap-2 ${isPeak ? "text-amber-600 dark:text-amber-300/90" : "text-sky-600 dark:text-sky-300/90"}`}>
            {isPeak ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="text-sm font-medium">{dateLabel}</span>
            <Badge variant="outline" className={`text-xs border ${isPeak ? "border-amber-500/30 text-amber-700 dark:text-amber-400" : "border-sky-500/30 text-sky-700 dark:text-sky-400"}`}>
              {isPeak ? "Peak" : "Dip"}
            </Badge>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-slate-100">
              ${point.close?.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400">/oz</span>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <div className={`text-sm font-semibold tabular-nums ${isPeak ? "text-emerald-400" : "text-rose-400"}`}>
            {isPeak ? "+" : ""}{point.pctChange?.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500">
            prom. {point.prominencePct?.toFixed(1)}%
          </div>
          {onDetailsClick && (
            <button
              onClick={onDetailsClick}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Details
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-white/5 pt-4">
        {loading ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Researching news…
            </div>
            {onCancelLoading && (
              <button
                onClick={onCancelLoading}
                className="flex items-center justify-center h-6 w-6 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                title="Cancel this analysis"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : analysis?._cancelled ? (
          <p className="text-sm text-slate-500">Analysis cancelled.</p>
        ) : analysis ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`border ${CONF_STYLES[analysis.confidence] || CONF_STYLES.low}`}>
                {analysis.confidence} confidence
              </Badge>
              {analysis.key_news_event && (
                <span className="text-xs text-slate-400">{analysis.key_news_event}</span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              {analysis.primary_explanation}
            </p>
            {analysis.confidence_reason && (
              <p className="text-xs text-slate-500 italic leading-relaxed">
                {analysis.confidence_reason}
              </p>
            )}
            {analysis.alternative_scenarios?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Alternative scenarios
                </div>
                {analysis.alternative_scenarios.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-600" />
                    <span>
                      {s.scenario}
                      <Badge variant="outline" className={`ml-2 border ${LIKE_STYLES[s.likelihood] || LIKE_STYLES.low}`}>
                        {s.likelihood}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Run "Explain events" to attach news-driven explanations.
          </p>
        )}
      </div>
    </div>
  );
}