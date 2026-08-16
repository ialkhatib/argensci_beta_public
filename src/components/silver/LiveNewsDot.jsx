import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, X, Newspaper, TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";

// Module-level cache so fetch survives component remounts
const newsCache = {};
const fetchingSet = {};
const listeners = {};

function subscribe(key, setter) {
  if (!listeners[key]) listeners[key] = new Set();
  listeners[key].add(setter);
  return () => listeners[key].delete(setter);
}

function notify(key, value) {
  listeners[key]?.forEach((fn) => fn(value));
}

async function fetchNews(key, assetName, price) {
  if (newsCache[key] || fetchingSet[key]) return;
  fetchingSet[key] = true;
  notify(key, { loading: true, news: null });
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a real-time commodities analyst. The current live spot price of ${assetName} is $${price?.toFixed(2)}/oz. Today's date is ${new Date().toISOString().slice(0, 10)}.

Using live web search, identify ALL significant market pressures moving ${assetName} prices RIGHT NOW — both bullish AND bearish forces. Cover at least 5–6 distinct drivers from the last 24–72 hours. Include geopolitical tensions, central bank policy, currency moves, industrial demand shifts, ETF flows, China-specific factors, supply disruptions, etc.

For each driver, find 1–2 real source article URLs from your web search results.

STRICT FACT-CHECKING RULES — apply before outputting each driver:
1. SELF-CONSISTENCY: Re-read the detail and verify the impact field matches what the detail actually describes. If the detail describes rising prices or inflows, impact must be "bullish"; if falling or outflows, "bearish". Correct any mismatch before outputting.
2. DIRECTIONAL VERBS: Any directional word in the title (e.g. "surges", "slashes", "cuts", "raises", "outflows", "inflows") must correctly reflect the actual direction of the event. Do not use "cuts" if the event was a rate increase.
3. NO FABRICATED SOURCES: The query string for each source must be a real, specific search query that would find the actual story. Never invent article titles or publication names.

Return a JSON object with:
- direction: "bullish" | "bearish" | "neutral" (net overall momentum)
- headline: one sentence summarising the single dominant theme today
- drivers: array of 5–6 objects, each with:
    - title: short descriptive factor name specific to ${assetName} (e.g. "${assetName === "Gold" ? "Gold ETF Inflows Surge" : "China Paper Silver Liquidation"}", "Fed Rate Cut Expectations")
    - detail: 1–2 sentences explaining exactly how this factor is affecting ${assetName} price right now
    - impact: "bullish" | "bearish" | "neutral"
    - sources: array of 1–2 objects, each with:
        - label: short source name or publication (e.g. "Reuters", "Bloomberg", "FT")
        - query: a specific Google News search query string (3–6 words) that would find this exact story, e.g. "China paper silver liquidation July 2026"`,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["bullish", "bearish", "neutral"] },
          headline: { type: "string" },
          drivers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                detail: { type: "string" },
                impact: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      query: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        required: ["direction", "headline", "drivers"],
      },
    });
    newsCache[key] = result;
    notify(key, { loading: false, news: result });
  } catch {
    notify(key, { loading: false, news: null });
  } finally {
    fetchingSet[key] = false;
  }
}

const IMPACT_STYLE = {
  bullish: { color: "#34d399", label: "↑", bg: "rgba(52,211,153,0.08)" },
  bearish: { color: "#f87171", label: "↓", bg: "rgba(248,113,113,0.08)" },
  neutral: { color: "#94a3b8", label: "→", bg: "rgba(148,163,184,0.08)" },
};

function NewsPopup({ anchorRef, assetName, loading, news, onClose, onRefresh }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popupWidth = 320;
    const popupHeight = 420;
    let left = rect.left + rect.width / 2 - popupWidth / 2;
    let top = rect.top - popupHeight - 12;

    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));
    if (top < 8) top = rect.bottom + 12;

    setPos({ top, left });
  }, [anchorRef]);

  const DirectionIcon = news?.direction === "bullish" ? TrendingUp : news?.direction === "bearish" ? TrendingDown : Minus;
  const dirColor = IMPACT_STYLE[news?.direction ?? "neutral"]?.color ?? "#94a3b8";

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: 320,
        maxHeight: 420,
        background: "rgba(15,18,23,0.55)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "14px",
        padding: "14px",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        fontSize: "12px",
        color: "#cbd5e1",
        overflowY: "auto",
        zIndex: 9999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#fbbf24", fontWeight: 700, fontSize: "12px" }}>
          <Newspaper style={{ width: 13, height: 13 }} />
          {assetName} News Drivers
        </div>
        <button
          onClick={onClose}
          style={{ color: "#475569", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#94a3b8" }}>
            <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: "11px" }}>Fetching live market pressures…</span>
          </div>
          <div style={{ fontSize: "10.5px", color: "#475569", lineHeight: 1.5 }}>
            Searching recent news for {assetName} drivers — Fed policy, geopolitical risk, dollar moves, ETF flows and more. This takes ~10–20 seconds.
          </div>
        </div>
      )}

      {!loading && !news && (
        <div style={{ padding: "16px 0", textAlign: "center" }}>
          <div style={{ color: "#475569", fontSize: "11px", marginBottom: "10px" }}>Could not load news.</div>
          <button
            onClick={onRefresh}
            style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: "8px", padding: "6px 12px",
              color: "#fbbf24", fontSize: "11px", fontWeight: 600, cursor: "pointer",
            }}
          >
            ↺ Retry
          </button>
        </div>
      )}

      {news && (
        <>
          <div style={{
            marginBottom: "10px",
            paddingBottom: "10px",
            borderBottom: "1px solid rgba(255,255,255,0.08)"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "7px" }}>
              <DirectionIcon style={{ width: 13, height: 13, color: dirColor, flexShrink: 0, marginTop: "1px" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.4 }}>{news.headline}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {news.drivers?.map((d, i) => {
              const style = IMPACT_STYLE[d.impact] ?? IMPACT_STYLE.neutral;
              return (
                <div key={i} style={{
                  borderRadius: "8px",
                  background: style.bg,
                  border: `1px solid ${style.color}22`,
                  padding: "8px 10px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: style.color, flexShrink: 0 }}>{style.label}</span>
                    <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "11px", lineHeight: 1.3 }}>{d.title}</span>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "10.5px", lineHeight: 1.5, marginBottom: d.sources?.length ? "6px" : 0 }}>
                    {d.detail}
                  </div>
                  {d.sources?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {d.sources.map((s, j) => {
                   const searchTerm = (s.query || s.label || "").trim();
                   if (!searchTerm) return null;
                   const href = `https://news.google.com/search?q=${encodeURIComponent(searchTerm)}`;
                   return (
                     <a
                       key={j}
                       href={href}
                       target="_blank"
                       rel="noopener noreferrer nofollow"
                       onClick={(e) => e.stopPropagation()}
                       style={{
                         display: "inline-flex", alignItems: "center", gap: "3px",
                         fontSize: "9.5px", color: "#fbbf24",
                         background: "rgba(251,191,36,0.08)",
                         border: "1px solid rgba(251,191,36,0.2)",
                         borderRadius: "4px", padding: "2px 6px",
                         textDecoration: "none", cursor: "pointer",
                       }}
                     >
                       <ExternalLink style={{ width: 8, height: 8 }} />
                       {s.label || "Search"}
                     </a>
                   );
                  })}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Refresh button — always visible at bottom */}
      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            background: loading ? "rgba(251,191,36,0.05)" : "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: "8px",
            padding: "7px 12px",
            color: loading ? "#92400e" : "#fbbf24",
            fontSize: "11px", fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading
            ? <><Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> Refreshing…</>
            : "↺ Refresh news"
          }
        </button>
      </div>

    </div>,
    document.body
  );
}

export default function LiveNewsDot({ cx, cy, price, asset }) {
  const assetName = asset === "gold" ? "Gold" : "Silver";
  // Round to nearest $5 so minor tick changes don't bust the cache
  const cacheKey = `livenews_${asset}_${Math.round((price ?? 0) / 5) * 5}`;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(!newsCache[cacheKey]);
  const [news, setNews] = useState(newsCache[cacheKey] ?? null);
  const dotRef = useRef(null);

  useEffect(() => {
    const unsub = subscribe(cacheKey, ({ loading: l, news: n }) => {
      setLoading(l);
      if (n) setNews(n);
    });
    if (!newsCache[cacheKey] && !fetchingSet[cacheKey]) {
      fetchNews(cacheKey, assetName, price);
    }
    return unsub;
  }, [cacheKey]);

  const stopAll = (e) => { e.stopPropagation(); e.preventDefault(); };
  const handleClick = (e) => {
    stopAll(e);
    // If opening and no data / previous failure, kick off a fresh fetch
    if (!open && !newsCache[cacheKey] && !fetchingSet[cacheKey]) {
      fetchNews(cacheKey, assetName, price);
    }
    setOpen((v) => !v);
  };

  const handleRefresh = () => {
    delete newsCache[cacheKey];
    delete fetchingSet[cacheKey];
    setNews(null);
    fetchNews(cacheKey, assetName, price);
  };

  return (
    <g onMouseDown={stopAll} onMouseUp={stopAll} onClick={handleClick} style={{ cursor: "pointer" }}>
      {/* Large hit area (ref here — used for portal anchor positioning) */}
      <rect ref={dotRef} x={cx - 32} y={cy - 32} width={64} height={64} fill="transparent" />
      {/* Invisible anchor for portal positioning — separate ref not needed; rect ref is sufficient */}
      <circle cx={cx} cy={cy} r={5} fill="#fbbf24" stroke="#0b0d10" strokeWidth={2} />
      {/* Radiating rings */}
      <circle cx={cx} cy={cy} r={9} fill="none" stroke="#fbbf24" strokeOpacity={0} strokeWidth={1.5}>
        <animate attributeName="r" values="7;16" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.6;0" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={9} fill="none" stroke="#fbbf24" strokeOpacity={0} strokeWidth={1}>
        <animate attributeName="r" values="7;16" dur="1.8s" begin="0.6s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.4;0" dur="1.8s" begin="0.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={9} fill="none" stroke="#fbbf24" strokeOpacity={0} strokeWidth={1}>
        <animate attributeName="r" values="7;16" dur="1.8s" begin="1.2s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.2;0" dur="1.8s" begin="1.2s" repeatCount="indefinite" />
      </circle>

      {open && (
        <NewsPopup
          anchorRef={dotRef}
          assetName={assetName}
          loading={loading}
          news={news}
          onClose={() => setOpen(false)}
          onRefresh={handleRefresh}
        />
      )}
    </g>
  );
}