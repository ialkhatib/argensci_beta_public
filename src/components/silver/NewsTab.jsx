import React, { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const DIR = {
  bullish: {
    icon: TrendingUp,
    label: "Bullish",
    color: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    bar: "bg-emerald-500/40",
  },
  bearish: {
    icon: TrendingDown,
    label: "Bearish",
    color: "text-rose-400",
    badge: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    bar: "bg-rose-500/40",
  },
  neutral: {
    icon: Minus,
    label: "Neutral",
    color: "text-slate-400",
    badge: "bg-slate-500/10 text-slate-300 border-slate-500/20",
    bar: "bg-slate-500/30",
  },
};

function ImpactBadge({ score, magnitude, decayTimeline }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1">
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono font-semibold text-amber-300">
        ⚡ {Math.ceil(score).toLocaleString()}
      </span>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onTouchStart={() => setShow(true)}
        onTouchEnd={() => setTimeout(() => setShow(false), 1800)}
        className="text-slate-600 hover:text-slate-400 transition-colors"
      >
        <Info className="h-3 w-3" />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 whitespace-nowrap rounded border border-amber-500/20 bg-amber-950/80 px-2 py-1 text-[10px] text-amber-200/80 shadow-md pointer-events-none">
          ~{((magnitude ?? 1) / 100).toFixed(3)} move · {decayTimeline}
        </span>
      )}
    </span>
  );
}

function sourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

const SOCIAL_DOMAINS = {
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "reddit.com": "Reddit",
  "facebook.com": "Facebook",
  "linkedin.com": "LinkedIn",
  "youtube.com": "YouTube",
  "instagram.com": "Instagram",
  "t.me": "Telegram",
  "tiktok.com": "TikTok",
};

function isSocialUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SOCIAL_DOMAINS[host] ?? null;
  } catch { return null; }
}

function SocialTag({ platform }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const show = () => {
    clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 2500);
  };

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={show}
        onMouseEnter={show}
        onMouseLeave={() => { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setVisible(false), 400); }}
        className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
      >
        📣 {platform}
      </button>
      {visible && (
        <span className="absolute bottom-full left-0 mb-1.5 z-50 w-52 rounded border border-violet-500/20 bg-slate-900/95 px-2.5 py-1.5 text-[11px] text-slate-300 shadow-lg pointer-events-none leading-snug">
          This source is from social media. Treat with extra caution — unverified claims are common.
        </span>
      )}
    </span>
  );
}

function openLink(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

const FORECAST_DURATION_MS = 90000;

const PHASES = [
  { at: 0,  label: "Gathering price data…" },
  { at: 5,  label: "Analysing historical trends…" },
  { at: 14, label: "Searching live news…" },
  { at: 28, label: "Synthesizing market intelligence…" },
  { at: 48, label: "Ranking key drivers…" },
  { at: 56, label: "Finalising…" },
];

function calcPct(startTime) {
  const elapsed = (Date.now() - (startTime ?? Date.now())) / 1000;
  return Math.min(Math.round((elapsed / (FORECAST_DURATION_MS / 1000)) * 100), 97);
}

function calcPhase(startTime) {
  const elapsed = (Date.now() - (startTime ?? Date.now())) / 1000;
  return ([...PHASES].reverse().find(ph => elapsed >= ph.at) ?? PHASES[0]).label;
}

function ForecastingLoader({ startTime }) {
  const [pct, setPct] = useState(() => calcPct(startTime));
  const [phase, setPhase] = useState(() => calcPhase(startTime));
  const startRef = useRef(startTime ?? Date.now());

  useEffect(() => {
    startRef.current = startTime ?? Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      // Cap at 97% — never auto-complete; waits for backend to respond
      const p = Math.min(Math.round((elapsed / (FORECAST_DURATION_MS / 1000)) * 100), 97);
      setPct(p);
      const current = [...PHASES].reverse().find(ph => elapsed >= ph.at);
      if (current) setPhase(current.label);
    }, 200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      <p className="text-sm text-slate-500">{phase}</p>
      <div className="relative w-48 overflow-hidden rounded-md border border-amber-500/40 py-1.5 text-center text-sm font-medium text-amber-300">
        <span
          className="absolute inset-y-0 left-0 bg-amber-500/20 transition-none"
          style={{ width: `${pct}%` }}
        />
        <span className="relative tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

export default function NewsTab({ headlines = [], loading, assetName, onRefresh, forecasting, forecastStartTime, generatedAt }) {
  if (forecasting) {
    return <ForecastingLoader startTime={forecastStartTime} />;
  }

  if (!headlines.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center space-y-3">
        <p className="text-sm text-slate-500">No headlines yet.</p>
        <p className="text-xs text-slate-600">Run a Market Intelligence Forecast to load live {assetName} news.</p>
        <Button variant="outline" size="sm" onClick={onRefresh} className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10 mt-2">
          Run Forecast
        </Button>
      </div>
    );
  }

  const bullCount = headlines.filter(h => h.direction === "bullish").length;
  const bearCount = headlines.filter(h => h.direction === "bearish").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400 font-medium">{bullCount} bullish</span>
          <span className="text-slate-600">·</span>
          <span className="text-rose-400 font-medium">{bearCount} bearish</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{headlines.length - bullCount - bearCount} neutral</span>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Headline cards */}
      <div className="flex flex-col gap-3">
        {headlines.map((item, i) => {
          const { icon: Icon, label, color, badge, bar } = DIR[item.direction] ?? DIR.neutral;
          return (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
            >
              {/* Direction bar */}
              <div className={`h-0.5 w-full ${bar}`} />
              <div className="px-4 py-3 space-y-2">
                {/* Direction badge + title */}
                <div className="flex items-start gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0 mt-0.5 ${badge}`}>
                    <Icon className={`h-3 w-3 ${color}`} />
                    {label}
                  </span>
                  <button
                    onClick={() => openLink(`https://www.google.com/search?q=${encodeURIComponent(item.title)}`)}
                    className="text-sm font-medium text-slate-200 leading-snug hover:underline underline-offset-2 flex items-start gap-1 group text-left"
                  >
                    {item.title}
                    <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>
                </div>

                {/* Repriced catalyst banner */}
                {item.repricing_status === 'repriced' && item.repricing_trigger && (
                  <div className="flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5">
                    <span className="text-amber-400 shrink-0 mt-0.5">↺</span>
                    <p className="text-xs text-amber-300/80 leading-snug"><span className="font-medium text-amber-300">Reactivated:</span> {item.repricing_trigger}</p>
                  </div>
                )}

                {/* Counter-pressure banner */}
                {item.has_counter_pressure && item.counter_pressure_note && (
                  <div className="flex items-start gap-1.5 rounded-md border border-slate-500/20 bg-slate-500/[0.06] px-2.5 py-1.5">
                    <span className="text-slate-400 shrink-0 mt-0.5">⇅</span>
                    <p className="text-xs text-slate-400 leading-snug"><span className="font-medium text-slate-300">Opposing forces:</span> {item.counter_pressure_note}</p>
                  </div>
                )}

                {/* Context */}
                {item.source_context && (
                  <p className="text-xs text-slate-500 leading-relaxed">{item.source_context}</p>
                )}

                {/* Timing + impact row */}
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="text-slate-600">Starts:</span> {item.commencement}
                  </span>
                  <span className="text-slate-700">·</span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="text-slate-600">Duration:</span> {item.decay_timeline}
                  </span>
                  {item.impact_score != null && (
                    <>
                      <span className="text-slate-700">·</span>
                      <ImpactBadge score={item.impact_score} magnitude={item.magnitude} decayTimeline={item.decay_timeline} />
                    </>
                  )}
                </div>

                {/* Source + date row */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                  {item.source_url ? (
                    <>
                      <button
                        onClick={() => openLink(`https://www.google.com/search?q=${encodeURIComponent(item.title)}&btnI=1`)}
                        className="inline-flex items-center gap-1 hover:text-slate-400 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Source
                      </button>
                      {isSocialUrl(item.source_url) && (
                        <SocialTag platform={isSocialUrl(item.source_url)} />
                      )}
                    </>
                  ) : (
                    <span>AI synthesis</span>
                  )}

                  {item.display_date && (
                    <>
                      <span>·</span>
                      {item.is_realtime ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
                          </span>
                          Breaking · {new Date(item.display_date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      ) : (
                        <span>Since {new Date(item.display_date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-700 pt-1">
        Headlines synthesized by AI from live web data at time of last forecast. Not financial advice.
      </p>
    </div>
  );
}