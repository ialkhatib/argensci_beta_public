import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { analysisStore } from "@/lib/analysisStore";

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

export default function EventDetail() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date");
  const type = params.get("type") || "peak";
  const asset = params.get("asset") || "silver";
  const assetName = asset === "gold" ? "Gold" : "Silver";

  const storageKey = `silver_event_${date}_${type}`;

  // Try sessionStorage first (fast path from Home navigation)
  const cached = (() => {
    try {
      const s = sessionStorage.getItem(storageKey);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  })();

  // Check live analysisStore first (survives navigation without sessionStorage round-trip)
  const storeKey = `${date}_${type}`;
  const storeAnalysis = analysisStore.analyses[storeKey] ?? null;

  // Derive clean initial state from store (source of truth) — ignore sentinels
  const isRealResult = (r) => r && !r._loading && !r._cancelled;
  const initialAnalysis = isRealResult(storeAnalysis) ? storeAnalysis
    : isRealResult(cached?.analysis) ? cached.analysis
    : null;
  const initialAnalyzing = !initialAnalysis && !!(cached?.point) && (storeAnalysis?._loading === true);

  const [point, setPoint] = useState(cached?.point ?? null);
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [loadingPoint, setLoadingPoint] = useState(!cached?.point);
  const [analyzing, setAnalyzing] = useState(initialAnalyzing);
  const [loadError, setLoadError] = useState(null);
  // Track whether THIS mount has already launched an LLM call — reset each mount intentionally
  const didAnalyze = useRef(storeAnalysis?._loading === true); // if already in-flight, don't re-fire
  const abortRef = useRef(null);

  // Subscribe to store — pick up real results from any source (EventDetail or bulk analyze)
  useEffect(() => {
    return analysisStore.subscribe((updated) => {
      const result = updated[storeKey];
      if (isRealResult(result)) {
        setAnalysis(result);
        setAnalyzing(false);
      } else if (result?._cancelled) {
        setAnalyzing(false);
      }
    });
  }, [storeKey]);

  // Deep-link / reload: fetch price data dynamically if sessionStorage is empty
  useEffect(() => {
    if (point || !date) return;

    setLoadingPoint(true);
    // Fetch a 14-day window ending on (and including) the target date to get the point + prev session
    const targetDate = new Date(date);
    const fromDate = new Date(targetDate);
    fromDate.setDate(fromDate.getDate() - 14);
    const dateFrom = fromDate.toISOString().slice(0, 10);
    const dateTo = date;

    base44.functions.invoke("fetchSilverPrices", { asset, dateFrom, dateTo, interval: "1d" })
      .then((res) => {
        const pts = res.data?.points;
        if (!pts?.length) throw new Error("No price data returned");

        // Find the exact date or the closest trading day on or before target
        let idx = pts.findIndex((p) => p.date === date);
        if (idx === -1) {
          // Find closest date <= target
          for (let i = pts.length - 1; i >= 0; i--) {
            if (pts[i].date <= date) { idx = i; break; }
          }
        }
        if (idx === -1) throw new Error("Target date not found in price data");

        const p = pts[idx];
        const prev = idx > 0 ? pts[idx - 1] : null;
        const pctChange = prev && prev.close > 0 ? ((p.close - prev.close) / prev.close) * 100 : 0;

        const constructed = {
          date: p.date,
          close: p.close,
          high: p.high,
          low: p.low,
          pctChange,
          // prominencePct not available from raw data — omit gracefully
        };

        setPoint(constructed);
        // Persist so back-navigation from a further page works
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ point: constructed, analysis: null }));
        } catch {}
      })
      .catch((e) => setLoadError(e.message || "Failed to load price data"))
      .finally(() => setLoadingPoint(false));
  }, [date, asset, point, storageKey]);

  // Cancel handler
  const handleCancel = () => {
    abortRef.current = "cancelled";
    analysisStore.set(storeKey, { event_date: date, event_type: type, _cancelled: true, primary_explanation: "Analysis cancelled.", confidence: "low" });
    setAnalysis({ event_date: date, event_type: type, _cancelled: true, primary_explanation: "Analysis cancelled.", confidence: "low" });
    setAnalyzing(false);
  };

  // Run LLM analysis once point is available and no analysis yet
  useEffect(() => {
    if (!point || analysis || didAnalyze.current) return;
    // Also skip if already in-flight from a previous mount (store has _loading sentinel)
    if (analysisStore.analyses[storeKey]?._loading) { didAnalyze.current = true; return; }
    didAnalyze.current = true;
    abortRef.current = null;
    setAnalyzing(true);
    // Mark in global store so PeakCard on the Events tab shows spinner + cancel X
    analysisStore.set(storeKey, { event_date: date, event_type: type, _loading: true });

    const prompt = `You are a macroeconomics and commodities analyst with deep knowledge of precious metals markets.

Analyze this single ${assetName} price event:
- Type: ${type.toUpperCase()} (${type === "peak" ? "local price high" : "local price low"})
- Date: ${point.date}
- ${assetName} price: $${point.close?.toFixed(2)}/oz
- Move vs prior: ${point.pctChange >= 0 ? "+" : ""}${point.pctChange?.toFixed(1)}%${point.prominencePct != null ? `\n- Prominence: ${point.prominencePct?.toFixed(1)}% of price range` : ""}${point.binStart && point.binStart !== point.binEnd ? `\n- Period: ${point.binStart} to ${point.binEnd}` : ""}

Use your knowledge and live web search to identify real-world news and macro factors that explain why ${assetName} reached this ${type} around that date.

${type === "peak"
  ? "Consider: Fed rate-cut expectations, dollar weakness, inflation, geopolitical tensions, safe-haven demand, solar/industrial demand, supply disruptions, gold correlation, ETF inflows."
  : "Consider: rate hike fears, dollar strength, recession fears, industrial demand weakness, profit-taking, supply gluts, ETF outflows, margin calls."}

Return a JSON object with:
- event_date: "${point.date}"
- event_type: "${type}"
- key_news_event: short headline of the single most likely driver
- primary_explanation: 2-4 sentences with concrete reasoning
- confidence: "high" | "medium" | "low"
- confidence_reason: one sentence explaining confidence level
- alternative_scenarios: array of 1-3 objects, each with "scenario" (string) and "likelihood" ("high"|"medium"|"low")`;

    base44.analytics.track({ eventName: "event_analysis_requested", properties: { asset, event_type: type, event_date: date } });
    base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          event_date: { type: "string" },
          event_type: { type: "string" },
          key_news_event: { type: "string" },
          primary_explanation: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          confidence_reason: { type: "string" },
          alternative_scenarios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                scenario: { type: "string" },
                likelihood: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
          },
        },
        required: ["event_date", "event_type", "primary_explanation", "confidence"],
      },
    }).then((result) => {
      if (abortRef.current === "cancelled") return;
      if (result?.event_date) {
        setAnalysis(result);
        // Update the shared analysisStore — Home picks this up immediately via subscription
        analysisStore.set(`${result.event_date}_${result.event_type}`, result);
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ point, analysis: result }));
        } catch {}
      }
    }).catch(() => {}).finally(() => {
      if (abortRef.current !== "cancelled") setAnalyzing(false);
    });
  }, [point, analysis, type, assetName, storageKey]);

  // Loading state while fetching price data
  if (loadingPoint) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
        <p className="text-sm">Loading price data…</p>
      </div>
    );
  }

  if (loadError || !point) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>{loadError || "No event data found."}</p>
        <button onClick={() => navigate("/")} className="text-sm underline underline-offset-4">
          ← Back to chart
        </button>
      </div>
    );
  }

  const isPeak = type === "peak";
  const dateLabel = new Date(point.date).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className={`absolute -top-40 left-1/3 h-96 w-96 rounded-full blur-3xl ${isPeak ? "bg-amber-400/5" : "bg-sky-400/5"}`} />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6" style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))", paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to chart
        </button>

        {/* Event header */}
        <div className={`rounded-2xl border p-6 mb-6 ${isPeak ? "border-amber-400/20 bg-amber-400/[0.03]" : "border-sky-400/20 bg-sky-400/[0.03]"}`}>
          <div className={`flex items-center gap-2 mb-2 ${isPeak ? "text-amber-300" : "text-sky-300"}`}>
            {isPeak ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            <span className="text-sm font-medium uppercase tracking-wide">
              {assetName} {isPeak ? "Price Peak" : "Price Dip"}
            </span>
          </div>
          <div className="text-3xl font-semibold text-foreground">{dateLabel}</div>
          <div className="mt-3 flex items-baseline gap-3 flex-wrap">
            <div>
              <span className="text-4xl font-bold tabular-nums text-foreground">
                ${point.close?.toFixed(2)}
              </span>
              <span className="text-muted-foreground ml-1">/oz</span>
            </div>
            {point.pctChange != null && (
              <div className={`text-xl font-semibold tabular-nums ${isPeak ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {point.pctChange >= 0 ? "+" : ""}{point.pctChange?.toFixed(1)}%
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-4 text-sm text-muted-foreground flex-wrap">
            {point.prominencePct != null && (
              <span>Prominence: <strong className="text-foreground">{point.prominencePct?.toFixed(1)}%</strong> of range</span>
            )}
            {point.high && <span>High: <strong className="text-foreground">${point.high?.toFixed(2)}</strong></span>}
            {point.low && <span>Low: <strong className="text-foreground">${point.low?.toFixed(2)}</strong></span>}
            {point.binStart && point.binStart !== point.binEnd && (
              <span>Bin: <strong className="text-foreground">{point.binStart} → {point.binEnd}</strong></span>
            )}
          </div>
        </div>

        {/* Analysis */}
        {analysis && !analysis._cancelled && !analysis._loading ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge variant="outline" className={`border text-sm px-3 py-1 ${CONF_STYLES[analysis.confidence] || CONF_STYLES.low}`}>
                  {analysis.confidence} confidence
                </Badge>
                {analysis.key_news_event && (
                  <span className="text-sm font-medium text-slate-200">{analysis.key_news_event}</span>
                )}
              </div>
              <p className="text-base leading-relaxed text-slate-300">
                {analysis.primary_explanation}
              </p>
              {analysis.confidence_reason && (
                <p className="mt-3 text-sm text-slate-500 italic leading-relaxed border-t border-white/5 pt-3">
                  <strong className="text-slate-400 not-italic">Confidence reasoning:</strong> {analysis.confidence_reason}
                </p>
              )}
            </div>

            {analysis.alternative_scenarios?.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
                  Alternative scenarios
                </h3>
                <div className="space-y-4">
                  {analysis.alternative_scenarios.map((s, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Badge variant="outline" className={`border shrink-0 mt-0.5 ${LIKE_STYLES[s.likelihood] || LIKE_STYLES.low}`}>
                        {s.likelihood}
                      </Badge>
                      <p className="text-sm leading-relaxed text-slate-300">{s.scenario}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : analyzing ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-3 text-slate-600" />
            <p className="mb-2">Analyzing this event…</p>
            <p className="text-sm mb-4">Searching live market context.</p>
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs transition-colors"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-500">
            <p>No analysis available.</p>
          </div>
        )}
      </div>
    </div>
  );
}