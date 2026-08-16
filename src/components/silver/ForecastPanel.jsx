import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, AlertTriangle, Calendar, Download, Zap, Lock, Clock } from "lucide-react";
import ExternalConsensus from "@/components/silver/ExternalConsensus";
import { exportForecastPdf } from "@/lib/exportForecastPdf";

const BIAS_STYLES = {
  bullish: { text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30", icon: TrendingUp },
  bearish: { text: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/30", icon: TrendingDown },
  neutral: { text: "text-slate-300", bg: "bg-slate-500/10 border-slate-500/30", icon: Minus },
};

const IMPACT_STYLES = {
  bullish: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  bearish: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  neutral: "bg-slate-500/10 text-slate-300 border-slate-500/20",
};

const WEIGHT_DOT = {
  high: "bg-amber-400",
  medium: "bg-slate-400",
  low: "bg-slate-600",
};

const DIRECTION_STYLES = {
  upside: "text-emerald-300",
  downside: "text-rose-300",
  both: "text-amber-300",
};

const IMPACT_LEVEL = {
  high: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-300 border-slate-500/20",
};

export default function ForecastPanel({ result, onClose, onRerun, forecastDaysInput, priceHistory, forecastRunKey, forecasting, isAuthenticated }) {
  const [expandedFactor, setExpandedFactor] = useState(null);
  const [exporting, setExporting] = useState(false);
  const externalConsensusRef = useRef(null);

  const navigate = useNavigate();

  if (!result) return null;

  const isLite = !!result.lite;
  const { quant, intelligence, spot, assetName, forecastDays } = result;
  const finalPoint = quant?.forecastPoints?.[quant.forecastPoints.length - 1];
  const bias = intelligence?.overall_bias || "neutral";
  const BiasIcon = BIAS_STYLES[bias]?.icon || Minus;
  // Use the days baked into the result, not the current input, so the heading
  // only changes when new data actually arrives.
  const calDays = forecastDays ?? forecastDaysInput;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportForecastPdf({
        result,
        calDays,
        externalConsensus: externalConsensusRef.current,
        priceHistory,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-amber-300/80 text-xs font-medium uppercase tracking-[0.15em]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />
                Market Intelligence · {assetName}
              </div>
              {isLite ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  <Zap className="h-2.5 w-2.5" /> Lite
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
                  <Zap className="h-2.5 w-2.5" /> Pro
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-xl font-semibold text-slate-100">
              {calDays}-Day Price Forecast
            </h2>
            {intelligence?.model_summary && (
              <p className="mt-1 text-sm text-slate-400">{intelligence.model_summary}</p>
            )}
            {result.generatedAt && (
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                <Clock className="h-3 w-3" />
                Generated {new Date(result.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-1">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 bg-amber-500/[0.06] hover:bg-amber-500/10 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export PDF"}
            </button>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 transition-colors text-xs underline underline-offset-2"
            >
              Close
            </button>
          </div>
        </div>

        {/* Overall bias pill */}
        <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 ${BIAS_STYLES[bias]?.bg}`}>
          <BiasIcon className={`h-4 w-4 ${BIAS_STYLES[bias]?.text}`} />
          <span className={`text-sm font-medium capitalize ${BIAS_STYLES[bias]?.text}`}>
            {intelligence?.bias_strength} {bias} bias
          </span>
        </div>
      </div>

      {/* Signed-in user with Lite result — prompt to re-run as Pro */}
      {isLite && !forecasting && isAuthenticated && (
        <div className="mx-5 mt-5 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">This is a Lite forecast</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Re-run to get full multi-pass Pro intelligence — deeper macro analysis, more topics, and permanent report saving.</p>
            </div>
          </div>
          <button
            onClick={() => onRerun()}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300 transition-colors whitespace-nowrap"
          >
            <Zap className="h-3 w-3" /> Re-run Pro
          </button>
        </div>
      )}

      {/* Lite upgrade prompt — shown at top of results, after load completes */}
      {isLite && !forecasting && !isAuthenticated && (
        <div className="mx-5 mt-5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex items-start gap-3">
          <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">You're on Lite mode</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Lite forecasts use a reduced discovery pass (3–4 topics) and a lighter model. Pro unlocks full multi-pass market intelligence, deeper macro analysis, structural drivers, and permanent report saving.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300 transition-colors"
            >
              <Zap className="h-3 w-3" /> Sign in for Pro access
            </button>
          </div>
        </div>
      )}

      {/* Quant Summary */}
      {finalPoint && (
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Quantitative Model Output
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Current Spot", value: `$${spot?.toFixed(2)}`, sub: "per oz" },
              { label: "Central Forecast", value: `$${finalPoint.central?.toFixed(2)}`, sub: `in ${calDays} days` },
              { label: "~68% Band (fat-tail adj.)", value: `$${finalPoint.lower1?.toFixed(0)}–${finalPoint.upper1?.toFixed(0)}`, sub: "t₄-adjusted, not Gaussian" },
              { label: "Hist. Volatility (σ)", value: `${quant?.annualisedVol?.toFixed(1)}%`, sub: `annualised · ${quant?.inputFrequency ?? ''} data` },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="text-xs text-slate-500 mb-1">{label}</div>
                <div className="text-base font-semibold tabular-nums text-slate-100">{value}</div>
                <div className="text-xs text-slate-600 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-600 leading-relaxed">
            † Bands use Student-t₄ quantiles (not standard normal) to account for the empirically documented fat tails and excess kurtosis of precious metal returns. Pure Gaussian ±1σ/±2σ would materially under-state tail risk.
          </p>
        </div>
      )}



      {/* AI Narrative */}
      {intelligence?.ai_narrative && (
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            AI Market Narrative
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">{intelligence.ai_narrative}</p>
          {intelligence.confidence_note && (
            <p className="mt-2 text-xs text-slate-500 italic">{intelligence.confidence_note}</p>
          )}
        </div>
      )}

      {/* Macro Factors */}
      {intelligence?.macro_factors?.length > 0 && (
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Macro Factors
          </h3>
          <div className="space-y-2">
            {intelligence.macro_factors.map((f, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedFactor(expandedFactor === i ? null : i)}
                >
                  <span className={`shrink-0 h-2 w-2 rounded-full ${WEIGHT_DOT[f.weight]}`} />
                  <span className="flex-1 text-sm font-medium text-slate-200">{f.name}</span>
                  <Badge variant="outline" className={`border text-xs shrink-0 ${IMPACT_STYLES[f.impact]}`}>
                    {f.impact}
                  </Badge>
                  {expandedFactor === i
                    ? <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />}
                </button>
                {expandedFactor === i && f.summary && (
                  <div className="px-4 pb-3 text-xs text-slate-400 leading-relaxed border-t border-white/5 pt-2">
                    {f.summary}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" /> High weight
              <span className="ml-2 h-1.5 w-1.5 rounded-full bg-slate-400 inline-block" /> Medium
              <span className="ml-2 h-1.5 w-1.5 rounded-full bg-slate-600 inline-block" /> Low
            </span>
          </p>
        </div>
      )}

      {/* Key Risk Events */}
      {intelligence?.key_risk_events?.length > 0 && (
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Key Risk Events
          </h3>
          <div className="space-y-2">
            {intelligence.key_risk_events.map((e, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${DIRECTION_STYLES[e.direction]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{e.event}</span>
                    <Badge variant="outline" className={`border text-xs ${IMPACT_LEVEL[e.potential_impact]}`}>
                      {e.potential_impact} impact
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-2">
                    <span>{e.date_approximate}</span>
                    <span className={`capitalize ${DIRECTION_STYLES[e.direction]}`}>· {e.direction} risk</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scenarios */}
      {(intelligence?.upside_scenario || intelligence?.downside_scenario) && (
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Tail Scenarios</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {intelligence.upside_scenario && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-emerald-400 uppercase tracking-wide">
                  <TrendingUp className="h-3.5 w-3.5" /> Upper bound scenario
                </div>
                <p className="text-sm text-slate-300">{intelligence.upside_scenario}</p>
                {finalPoint && (
                  <p className="mt-2 text-xs text-emerald-400/60 tabular-nums">Target: ${finalPoint.upper2?.toFixed(2)}/oz</p>
                )}
              </div>
            )}
            {intelligence.downside_scenario && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-rose-400 uppercase tracking-wide">
                  <TrendingDown className="h-3.5 w-3.5" /> Lower bound scenario
                </div>
                <p className="text-sm text-slate-300">{intelligence.downside_scenario}</p>
                {finalPoint && (
                  <p className="mt-2 text-xs text-rose-400/60 tabular-nums">Target: ${finalPoint.lower2?.toFixed(2)}/oz</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* External Analyst Consensus — timeframe-aware links */}
      <ExternalConsensus assetName={assetName} calDays={calDays} dataRef={externalConsensusRef} resetKey={forecastRunKey} forecasting={forecasting} />
    </div>
  );
}