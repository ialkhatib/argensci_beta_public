import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Loader2, RefreshCw, X } from "lucide-react";

const VERDICT_STYLES = {
  buy: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  sell: "text-rose-300 bg-rose-500/10 border-rose-500/20",
  hold: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  neutral: "text-slate-300 bg-slate-500/10 border-slate-500/20",
};

// Cache keyed by "asset_calDays" — persisted to localStorage
const STORAGE_KEY = "argensci_external_consensus";
let cache = {};
try { cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch {}

function persistCache() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
}

export default function ExternalConsensus({ assetName, calDays, dataRef, resetKey, forecasting }) {
  const cacheKey = `${assetName}_${calDays}`;
  // Don't hydrate from cache if we're in the middle of a new forecast run
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const abortRef = useRef(false);
  // Track whether this component instance has been reset by an in-progress forecast
  const resetRef = useRef(resetKey);

  // When resetKey changes (new forecast started), cancel any in-flight fetch and reset
  useEffect(() => {
    resetRef.current = resetKey;
    abortRef.current = true;
    setLoading(false);
    setStarted(false);
    setData(null);
  }, [resetKey]);

  // Expose current data to parent via ref so PDF export can include it
  useEffect(() => {
    if (dataRef) dataRef.current = data;
  }, [data, dataRef]);

  const doFetch = async () => {
    // Don't serve cache if a new forecast has started (resetKey advanced)
    if (cache[cacheKey] && resetRef.current === resetKey) {
      setData(cache[cacheKey]);
      return;
    }
    abortRef.current = false;
    setLoading(true);
    setData(null);

    const todayStr = new Date().toISOString().slice(0, 10);
    const endDateStr = new Date(Date.now() + calDays * 86400000).toISOString().slice(0, 10);

    const prompt = `You are a financial research assistant. Today is ${todayStr}. Search the web for the most current news and analyst views on ${assetName} (precious metal spot price).

Your job is to find 3–5 sources whose content is genuinely relevant to a ${calDays}-day horizon (from ${todayStr} to ${endDateStr}). Relevance is determined by the ACTUAL EXPECTED DURATION AND IMPACT of each event on ${assetName} prices — not just whether the event is happening now.

Apply this reasoning for each event or factor you find:
- If an event (e.g. a geopolitical flare-up, a rate decision, a supply shock) is expected to resolve or have its primary price impact WITHIN the next ${calDays} days → HIGH relevance, include it prominently.
- If the same event is described in the news as a brief flare-up or one-off that will pass quickly, and the horizon is longer (e.g. 90 days) → LOW relevance for this window, either omit it or rank it last.
- If a structural trend (e.g. Fed rate trajectory, industrial demand) will meaningfully play out over the next ${calDays} days → include it.
- If a structural trend only matters over many months and the horizon is short (e.g. 7 days) → exclude it.

Find sources from: Kitco, Reuters, Bloomberg, MarketWatch, Investopedia, TheStreet, GoldSilver.com, CPM Group, MoneyMetals, or similar. Each must have a real verifiable https URL.

For each source:
- source: publisher name
- title: exact real article title
- url: full https URL
- verdict: "buy" | "sell" | "hold" | "neutral" for THIS specific ${calDays}-day window
- one_line: one sentence explaining WHY this source/event is relevant to the ${calDays}-day window, citing the expected duration or impact timeline of the catalyst

Order by expected price impact within the ${calDays}-day window — highest impact first. Do not fabricate URLs.`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  source: { type: "string" },
                  title: { type: "string" },
                  url: { type: "string" },
                  verdict: { type: "string", enum: ["buy", "sell", "hold", "neutral"] },
                  one_line: { type: "string" },
                },
                required: ["source", "title", "url", "verdict", "one_line"],
              },
            },
          },
          required: ["sources"],
        },
      });
      if (abortRef.current) return;
      cache[cacheKey] = result;
      persistCache();
      setData(result);
    } catch {
      if (!abortRef.current) setData({ sources: [] });
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  };

  const handleStart = () => {
    setStarted(true);
    doFetch();
  };

  const handleCancel = () => {
    abortRef.current = true;
    setLoading(false);
    setStarted(false);
    setData(null);
  };

  const handleRefresh = () => {
    delete cache[cacheKey];
    doFetch();
  };

  return (
    <div className="px-5 py-4 border-t border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" />
          External Analyst Consensus
          <span className="normal-case font-normal text-slate-600 ml-1">· {calDays}-day horizon</span>
        </h3>
        <div className="flex items-center gap-2">
          {loading && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg px-2 py-1 transition-colors"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          )}
          {!loading && data && (
            <button
              onClick={handleRefresh}
              className="text-slate-600 hover:text-slate-400 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!started ? (
        <button
          onClick={handleStart}
          disabled={forecasting}
          className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {forecasting
            ? "Waiting for forecast to complete…"
            : `Search external analyst sources for ${calDays}-day outlook →`}
        </button>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching analyst sources for {calDays}-day outlook…
        </div>
      ) : !data?.sources?.length ? (
        <p className="text-xs text-slate-600 py-2">No external sources found. Try refreshing.</p>
      ) : (
        <div className="space-y-2">
          {data.sources.map((s, i) => {
            const isValidUrl = s.url && s.url.startsWith("https://");
            const href = isValidUrl
              ? s.url
              : `https://news.google.com/search?q=${encodeURIComponent(s.title + " " + s.source)}`;
            return (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 hover:bg-white/[0.05] transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.source}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${VERDICT_STYLES[s.verdict] ?? VERDICT_STYLES.neutral}`}>
                      {s.verdict}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-300 group-hover:text-slate-100 transition-colors leading-snug line-clamp-1">{s.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{s.one_line}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 shrink-0 mt-1 transition-colors" />
              </a>
            );
          })}
        </div>
      )}
      {started && <p className="mt-2 text-xs text-slate-700">Sources retrieved via live web search · not financial advice</p>}
    </div>
  );
}