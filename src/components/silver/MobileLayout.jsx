import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart2, List, TrendingUp, Settings as SettingsIcon, SlidersHorizontal, Sun, Moon, Radio, Loader2, RefreshCw, Monitor, Newspaper, LogIn, Trash2, Zap, Lock, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import PsdChart from "@/components/silver/PsdChart";
import NewsRibbon from "@/components/silver/NewsRibbon";
import NewsTab from "@/components/silver/NewsTab";
import { useForceDesktop } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import SilverChart from "@/components/silver/SilverChart";
import PeakCard from "@/components/silver/PeakCard";
import ForecastPanel from "@/components/silver/ForecastPanel";
import StructuralDriversPanel from "@/components/silver/StructuralDriversPanel";
import ProUpsellBanner from "@/components/silver/ProUpsellBanner";
import SavedReports from "@/components/silver/SavedReports";
import GoogleAd from "@/components/GoogleAd";
import EventSortControl, { sortEvents } from "@/components/silver/EventSortControl";
import AccountSettingsDialog from "@/components/silver/AccountSettingsDialog";
import CreditHistory from "@/components/silver/CreditHistory";

const MIN_DATE = "1994-01-01";

const TABS = [
  { id: "chart", label: "Chart", Icon: BarChart2 },
  { id: "events", label: "Events", Icon: List },
  { id: "forecast", label: "Forecast", Icon: TrendingUp },
  { id: "news", label: "News", Icon: Newspaper },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export default function MobileLayout({
  // Data
  asset, setAsset,
  binned, peaks, dips,
  forecastResult, setForecastResult,
  forecasting, analyzing,
  allEvents, analyses,
  loadingData,
  spot, spotChangePct, autoRefreshing, autoRefreshEnabled, setAutoRefreshEnabled, lastUpdated,
  autoBinHint,
  newsHeadlines,
  // Controls state
  binSize, setBinSize,
  prominencePct, setProminencePct,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  // Actions
  onDotClick, onZoom, onReset, isZoomed,
  onAnalyze, onCancel, onCancelEvent,
  onForecast, onCancelForecast, onClearForecast, forecastDays, setForecastDays,
  onCardDetailClick,
  // Forecast run key for resetting ExternalConsensus
  forecastRunKey,
  forecastStartTime,
  forecastError,
  // Auth
  user, isAuthenticated, logout,
  credits,
  // Theme
  isDark, toggleDark,
  // Tab state (URL-driven from Home)
  activeTab, setActiveTab,
  // Pull-to-refresh passthrough
  pullContainerProps,
}) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [, setForceDesktop] = useForceDesktop();
  const [eventSortOrder, setEventSortOrder] = useState("prominence");
  const [psdOpen, setPsdOpen] = useState(false);

  // Progress tracker for the chart-tab loading bar (mirrors forecast tab)
  const [forecastProgressForChart, setForecastProgressForChart] = useState(0);
  const chartProgressTimerRef = useRef(null);
  useEffect(() => {
    if (forecasting) {
      setForecastProgressForChart(0);
      const start = Date.now();
      chartProgressTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        setForecastProgressForChart(Math.min(elapsed / 90, 0.97));
      }, 200);
    } else {
      clearInterval(chartProgressTimerRef.current);
      setForecastProgressForChart(0);
    }
    return () => clearInterval(chartProgressTimerRef.current);
  }, [forecasting]);

  const tabBarHeight = "calc(56px + env(safe-area-inset-bottom))";

  const MIN_DATE = "1994-01-01";
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

  // ── Chart Tab ──────────────────────────────────────────────────────────────
  const ChartTab = (
    <div className="flex flex-col gap-4">
      {/* Asset toggle + theme + spot */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex rounded-xl border border-border overflow-hidden">
          {["silver", "gold"].map((a) => {
            const isActive = asset === a;
            const isGold = a === "gold";
            return (
              <button
                key={a}
                onClick={() => { if (a === asset) return; setAsset(a); }}
                className={`min-h-[44px] px-5 text-sm font-medium capitalize transition-colors ${
                  isActive
                    ? isGold
                      ? "bg-yellow-400/15 text-yellow-600 dark:text-yellow-300 border-r border-border last:border-r-0"
                      : "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-100"
                    : "bg-white/[0.03] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDark}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Spot price */}
      {spot != null && (
        <div className="flex flex-wrap items-center gap-3">
          <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 ${asset === "gold" ? "border-yellow-400/20 bg-yellow-400/[0.04]" : "border-white/10 bg-white/[0.03]"}`}>
            {autoRefreshEnabled && (
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${autoRefreshing ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${autoRefreshing ? "bg-amber-400" : "bg-emerald-400"}`} />
              </span>
            )}
            <span className={`text-xs ${asset === "gold" ? "text-yellow-700 dark:text-yellow-400/60" : "text-slate-500"}`}>Spot {asset}</span>
            <span className={`text-lg font-semibold tabular-nums ${asset === "gold" ? "text-yellow-700 dark:text-yellow-300" : "text-slate-100"}`}>
              ${spot.toFixed(2)}
            </span>
            <span className={`text-xs ${asset === "gold" ? "text-yellow-700 dark:text-yellow-400/60" : "text-slate-500"}`}>/oz</span>
          </div>
          {spotChangePct != null && (
            <span className={`text-sm font-medium tabular-nums ${spotChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {spotChangePct >= 0 ? "+" : ""}{spotChangePct.toFixed(2)}%
            </span>
          )}
          <button
            onClick={() => setAutoRefreshEnabled((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              autoRefreshEnabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 bg-white/[0.03] text-slate-500"
            }`}
          >
            <Radio className="h-3 w-3" />
            {autoRefreshEnabled ? "Live" : "Paused"}
          </button>
        </div>
      )}

      {/* News ribbon — right under the spot/live row */}
      {(newsHeadlines?.length > 0 || forecasting) && (
        <NewsRibbon headlines={newsHeadlines ?? []} loading={forecasting} />
      )}

      {/* Adjust Scales button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full bg-amber-400 text-slate-900 text-sm font-semibold shadow-md shadow-amber-500/20 active:scale-95 transition-transform"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Adjust Scales
      </button>

      {/* Smart forecast CTA — shown right under Adjust Scales */}
      {forecasting ? (
        // Loading bar — no cancel, no commentary
        <div className="relative w-full overflow-hidden rounded-xl border border-amber-500/20 bg-white/[0.02] h-10">
          <span
            className="absolute inset-y-0 left-0 bg-amber-500/25 transition-none rounded-xl"
            style={{ width: `${forecastProgressForChart * 100}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400/70" />
            <span className="text-xs text-amber-400/70 font-medium">Loading forecast</span>
          </span>
        </div>
      ) : forecastResult ? (
        // Completed forecast
        forecastResult.lite && isAuthenticated ? (
          // Lite + logged in → offer Pro re-run, switch to forecast tab
          <button
            onClick={() => { setActiveTab("forecast"); onForecast(); }}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Re-run for <span className="inline-flex items-center gap-1 ml-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">Pro</span>
            <span className="text-xs text-slate-500 ml-0.5">· 1 credit</span>
          </button>
        ) : forecastResult.lite && !isAuthenticated ? (
          // Lite + not logged in → upsell sign-in
          <button
            onClick={() => navigate("/login")}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Sign in for Pro · start free with 3 credits
          </button>
        ) : !isAuthenticated ? (
          // Pro forecast loaded but signed out → prompt to log back in
          <button
            onClick={() => navigate("/login")}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Log back in to continue forecasting
          </button>
        ) : (
          // Pro forecast done → go to Forecast tab
          <button
            onClick={() => setActiveTab("forecast")}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Go to Forecast <span className="inline-flex items-center gap-1 ml-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">Pro</span>
          </button>
        )
      ) : (
        // No forecast yet
        isAuthenticated ? (
          // Logged in → go to Forecast tab (Pro)
          <button
            onClick={() => setActiveTab("forecast")}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Go to Forecast <span className="inline-flex items-center gap-1 ml-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">Pro</span>
          </button>
        ) : (
          // Not logged in → run Lite
          <button
            onClick={() => onForecast()}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Run Lite forecast — free
          </button>
        )
      )}

      {/* Chart */}
      {loadingData ? (
        <div className="flex h-72 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <SilverChart
          data={binned}
          peaks={peaks}
          dips={dips}
          onDotClick={onDotClick}
          onZoom={onZoom}
          onReset={onReset}
          isZoomed={isZoomed}
          forecastPoints={forecastResult?.quant?.forecastPoints}
          asset={asset}
          isAuthenticated={isAuthenticated}
          hasForecast={!!forecastResult}
          isLiteForecast={!!forecastResult?.lite}
          onRerun={onForecast}
        />
      )}



      {/* PSD collapsible — always present, updates with forecast */}
      {!loadingData && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <button
            onClick={() => setPsdOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
          >
            <span className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-violet-400/70" />
              <span className="text-sm font-medium text-slate-300">Spectral Analysis</span>
              <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-400">Beta</span>
            </span>
            {psdOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>
          {psdOpen && (
            <div className="px-4 pb-4 border-t border-white/5">
              <p className="text-[11px] text-violet-400/60 mt-3 mb-3 flex items-center gap-1.5">
                <FlaskConical className="h-3 w-3" /> Beta — experimental. Interpret with caution.
              </p>
              <PsdChart
                binnedPoints={binned}
                forecastPoints={forecastResult?.quant?.forecastPoints}
              />
            </div>
          )}
        </div>
      )}

      {/* Controls Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="bg-background border-border text-foreground max-h-[90vh]">
          <DrawerHeader className="pb-0">
            <DrawerTitle className="text-foreground text-base">Chart Controls</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 overflow-y-auto space-y-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)" }}>
            {/* Date range quick buttons */}
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Date Range</p>
              <div className="flex flex-wrap gap-2 mb-3">
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
                    className={`rounded-lg border px-3 py-2 text-xs transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                      activePreset === label
                        ? "border-amber-500/60 bg-amber-500/15 text-amber-500 dark:text-amber-300 font-semibold"
                        : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-foreground">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    min={MIN_DATE}
                    max={dateTo}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-foreground">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                  />
                </div>
              </div>
            </div>

            {/* Bin size */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs font-medium text-foreground">Binning — analysis scale</p>
                <span className="text-xs tabular-nums text-foreground">
                  {binSize <= 1 ? "Daily" : `${binSize} sessions`}
                </span>
              </div>
              <Slider value={[binSize]} onValueChange={(v) => setBinSize(v[0])} min={1} max={60} step={1} />
              <p className="text-xs text-muted-foreground">Smaller = short spikes; larger = macro cycles.</p>
            </div>

            {/* Prominence */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs font-medium text-foreground">Prominence threshold</p>
                <span className="text-xs tabular-nums text-foreground">{prominencePct.toFixed(1)}%</span>
              </div>
              <Slider value={[prominencePct]} onValueChange={(v) => setProminencePct(v[0])} min={1} max={25} step={0.5} />
            </div>


          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );

  // ── Events Tab ─────────────────────────────────────────────────────────────
  const sortedEvents = useMemo(
    () => sortEvents(allEvents, eventSortOrder, analyses),
    [allEvents, eventSortOrder, analyses]
  );

  const EventsTab = (
    <div>
      {/* Explain events button */}
      <div className="flex gap-2 mb-4">
        <Button
          onClick={onAnalyze}
          disabled={analyzing || loadingData || allEvents.length === 0}
          className="flex-1 bg-gradient-to-r from-amber-200 to-slate-200 text-slate-900 font-medium"
        >
          {analyzing
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</>
            : `Explain ${allEvents.length} events`}
        </Button>
        {analyzing && (
          <Button variant="outline" onClick={onCancel} className="border-rose-500/40 text-rose-300">
            Cancel
          </Button>
        )}
      </div>

      {loadingData ? (
        <div className="flex h-40 items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : allEvents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-sm text-slate-500">
          No events at current threshold. Adjust scales on the Chart tab.
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between flex-wrap gap-1">
            <h2 className="text-base font-medium text-slate-200">
              Detected events
              <span className="ml-2 text-sm font-normal text-slate-500">
                {peaks.length} peaks · {dips.length} dips
              </span>
            </h2>
          </div>
          <div className="mb-4">
            <EventSortControl value={eventSortOrder} onChange={setEventSortOrder} />
          </div>
          <div className="flex flex-col gap-4">
            {sortedEvents.map((p) => {
              const eventKey = `${p.date}_${p.eventType}`;
              const eventAnalysis = analyses[eventKey];
              const isLoadingThis = (analyzing && !eventAnalysis) || !!eventAnalysis?._loading;
              return (
                <PeakCard
                  key={eventKey}
                  point={p}
                  type={p.eventType}
                  analysis={eventAnalysis?._loading ? null : eventAnalysis}
                  loading={isLoadingThis}
                  onDetailsClick={() => onCardDetailClick(p, p.eventType)}
                  onCancelLoading={isLoadingThis ? () => onCancelEvent(p.date, p.eventType) : undefined}

                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // ── Forecast Tab ───────────────────────────────────────────────────────────
  const [draftDays, setDraftDays] = useState("130");
  const [daysError, setDaysError] = useState(null);
  const [noCreditsError, setNoCreditsError] = useState(false);
  const [forecastProgress, setForecastProgress] = useState(0);
  const [forecastPhase, setForecastPhase] = useState("");
  const progressTimerRef = useRef(null);

  const PHASES = [
    { at: 0,  label: "Fetching price history…" },
    { at: 3,  label: "Computing log returns…" },
    { at: 8,  label: "Running GBM model…" },
    { at: 12, label: "Calibrating fat-tail bands…" },
    { at: 18, label: "Checking sources…" },
    { at: 28, label: "Synthesizing market intelligence…" },
    { at: 44, label: "Rendering forecast cone…" },
    { at: 56, label: "Finalising…" },
  ];
  const FORECAST_DURATION_MS = 90000;
  const forecastStartRef = useRef(null);

  useEffect(() => {
    if (forecasting) {
      setForecastProgress(0);
      setForecastPhase(PHASES[0].label);
      const start = Date.now();
      forecastStartRef.current = start;
      progressTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        // Cap at 97% — never auto-complete; waits for backend to respond
        setForecastProgress(Math.min(elapsed / (FORECAST_DURATION_MS / 1000), 0.97));
        const phase = [...PHASES].reverse().find(p => elapsed >= p.at);
        if (phase) setForecastPhase(phase.label);
      }, 200);
    } else {
      clearInterval(progressTimerRef.current);
      setForecastProgress(0);
      setForecastPhase("");
    }
    return () => clearInterval(progressTimerRef.current);
  }, [forecasting]);

  const handleForecastClick = () => {
    if (isAuthenticated && typeof credits === "number" && credits < 1) {
      setNoCreditsError(true);
      return;
    }
    setNoCreditsError(false);
    const n = parseInt(draftDays, 10);
    if (isNaN(n) || n < 7) { setDaysError("Minimum 7 days"); return; }
    if (n > 730) { setDaysError("Maximum 730 days"); return; }
    setDaysError(null);
    setForecastDays(n);
    onForecast(n); // pass days directly to avoid async state race
  };

  const ForecastTab = (
    <div className="space-y-4">
      {/* Credits banner */}
      {isAuthenticated && typeof credits === "number" && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${credits > 0 ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-rose-500/30 bg-rose-500/[0.06]"}`}>
          <Zap className={`h-4 w-4 shrink-0 ${credits > 0 ? "text-amber-400" : "text-rose-400"}`} />
          <span className={`text-sm font-semibold ${credits > 0 ? "text-amber-300" : "text-rose-300"}`}>
            {credits > 0 ? `${credits} Pro credit${credits !== 1 ? "s" : ""} remaining` : "No Pro credits remaining"}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-0.5 mb-1">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500 whitespace-nowrap">Forecast days</label>
          <input
            type="text"
            inputMode="numeric"
            value={draftDays}
            onChange={(e) => { setDraftDays(e.target.value.replace(/[^0-9]/g, "")); setDaysError(null); }}
            className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm tabular-nums text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
        </div>
        {daysError && <p className="text-xs text-amber-400">{daysError}</p>}
      </div>
      {noCreditsError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-rose-400 shrink-0" />
            <p className="text-sm text-rose-300 font-medium">No credits remaining — Lite forecasts still work</p>
          </div>
        </div>
      )}
      <Button
        onClick={handleForecastClick}
        disabled={forecasting || analyzing}
        className="w-full border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-medium"
        variant="outline"
      >
        {forecasting
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating forecast…</>
          : "Run Market Intelligence Forecast"}
      </Button>
      {forecasting && (
        <div className="flex flex-col gap-1.5">
          {/* Tier indicator during load */}
          <div className="flex items-center rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            {isAuthenticated ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <Zap className="h-3 w-3" /> Running Pro forecast
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <Zap className="h-3 w-3" /> Running Lite forecast
              </span>
            )}
          </div>
          {/* Lite upsell during load */}
          {!isAuthenticated && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] text-amber-300 font-medium leading-snug">Want the full Pro forecast?</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">Full multi-pass intelligence, 6–8 topics & saved reports.</p>
                <button onClick={() => navigate("/login")} className="mt-1.5 text-[10px] font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2">
                  Sign in for Pro →
                </button>
              </div>
            </div>
          )}
          <button
            onClick={onCancelForecast}
            className="relative w-full overflow-hidden rounded-md border border-rose-500/40 py-2 text-sm font-medium text-rose-300"
          >
            <span
              className="absolute inset-y-0 left-0 bg-rose-500/20 transition-none"
              style={{ width: `${forecastProgress * 100}%` }}
            />
            <span className="relative">Cancel</span>
          </button>
          {forecastPhase && (
            <p className="text-[11px] text-slate-500 text-center">{forecastPhase}</p>
          )}
        </div>
      )}

      {forecastResult && !forecasting && (
        <Button variant="outline" onClick={onClearForecast} className="w-full border-slate-500/40 text-slate-400 hover:text-slate-200 hover:bg-slate-500/10">
          <Trash2 className="h-4 w-4 mr-1.5" /> Clear forecast
        </Button>
      )}
      {/* Forecast error — shown prominently so user knows the run failed */}
      {forecastError && !forecasting && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-start gap-2 text-sm text-rose-300">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold">Forecast failed</p>
            <p className="text-xs text-rose-400/70 mt-0.5">{forecastError}</p>
          </div>
        </div>
      )}

      {/* Ad for unauthenticated users on mobile forecast tab */}
      {!isAuthenticated && <GoogleAd className="mb-2" />}

      {forecastResult ? (
        <ForecastPanel result={forecastResult} onClose={() => setForecastResult(null)} onRerun={onForecast} forecastDaysInput={forecastDays} priceHistory={binned} forecastRunKey={forecastRunKey} forecasting={forecasting} isAuthenticated={isAuthenticated} />
      ) : !forecasting && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-500">
          No forecast yet. Tap the button above to generate a {draftDays}-day projection.
        </div>
      )}

      <SavedReports
        asset={asset}
        isAuthenticated={isAuthenticated}
        currentResult={forecastResult}
        forecastDays={forecastDays}
        onLoad={(snapshot) => { setForecastResult(snapshot); }}
      />
    </div>
  );

  // ── Settings Tab ───────────────────────────────────────────────────────────
  const SettingsTab = (
    <div className="space-y-4">
      {/* User info */}
      {user?.email && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-slate-500 mb-1">Signed in as</p>
          <p className="text-sm font-medium text-slate-200">{user.email}</p>
        </div>
      )}

      {/* Credits — authenticated users */}
      {isAuthenticated && typeof credits === "number" && (
        <div className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${credits > 0 ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-rose-500/30 bg-rose-500/[0.06]"}`}>
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${credits > 0 ? "text-amber-400" : "text-rose-400"}`} />
            <div>
              <p className={`text-sm font-semibold ${credits > 0 ? "text-amber-300" : "text-rose-300"}`}>
                {credits} Pro credit{credits !== 1 ? "s" : ""} remaining
              </p>
              <p className="text-xs text-slate-500">Each Pro forecast costs 1 credit</p>
            </div>
          </div>
        </div>
      )}

      {/* Credit History */}
      <CreditHistory isAuthenticated={isAuthenticated} />

      {/* Model performance link */}
      <button
        onClick={() => navigate("/forecast-performance")}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400 hover:text-amber-400 text-left transition-colors flex items-center gap-2"
      >
        <BarChart2 className="h-4 w-4" /> Model Performance & Calibration
      </button>

      {/* Structural Drivers */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-200">Structural Drivers</p>
        <p className="text-xs text-slate-500">Long-term pressures permanently injected into the forecast drift, independent of the news ribbon.</p>
        <StructuralDriversPanel asset={asset} />
      </div>

      {/* Desktop view toggle */}
      <div className="rounded-2xl border border-border bg-muted/30 p-4 flex items-center justify-between">
        <div>
          <span className="text-sm text-foreground">Desktop view</span>
          <p className="text-xs text-muted-foreground mt-0.5">Switch to the full desktop layout</p>
        </div>
        <button
          onClick={() => setForceDesktop(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
        >
          <Monitor className="h-4 w-4" /> Switch
        </button>
      </div>

      {/* Theme toggle */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
        <span className="text-sm text-slate-300">Appearance</span>
        <button
          onClick={toggleDark}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          {isDark ? <><Sun className="h-4 w-4" /> Light mode</> : <><Moon className="h-4 w-4" /> Dark mode</>}
        </button>
      </div>

      {/* Sign in (guests) */}
      {!isAuthenticated && (
        <button
          onClick={() => navigate("/login")}
          className="w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400 font-medium flex items-center gap-2 transition-colors"
        >
          <LogIn className="h-4 w-4" /> Sign in / Create account
        </button>
      )}

      {/* Logout */}
      {isAuthenticated && (
        <button
          onClick={() => logout("/")}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400 hover:text-slate-200 text-left transition-colors"
        >
          Sign out
        </button>
      )}

      {/* Help */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-1" id="mobile-help">
        <p className="text-sm font-semibold text-slate-200">Help & Support</p>
        <p className="text-xs text-slate-500">For questions or issues, email us at:</p>
        <a href="mailto:i@argensci.com" className="text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors">
          i@argensci.com
        </a>
      </div>

      {/* Copyright */}
      <p className="text-xs text-muted-foreground text-center pt-2">
        © {new Date().getFullYear()} ArgenSci. All rights reserved. Not financial advice.
      </p>
      <a href="/terms" className="block text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors">
        Terms of Use
      </a>

      {/* Delete account */}
      {isAuthenticated && (
        <div className="w-full">
          <AccountSettingsDialog user={user} credits={credits} logout={logout} triggerClassName="w-full rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] p-4 text-sm text-rose-400 hover:bg-rose-500/10 text-left transition-colors" triggerLabel="Delete account…" />
        </div>
      )}
    </div>
  );

  const NewsTabContent = (
    <div className="space-y-4">
      {forecastResult?.lite && !forecasting && (newsHeadlines?.length > 0) && (
        isAuthenticated ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-sm text-amber-300 font-medium leading-snug">You're signed in — re-run for Pro analysis</p>
            </div>
            <button
              onClick={() => { setActiveTab("forecast"); onForecast(); }}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300 transition-colors"
            >
              <Zap className="h-3 w-3" /> Run Pro
            </button>
          </div>
        ) : (
          <ProUpsellBanner />
        )
      )}
      <NewsTab
        headlines={newsHeadlines ?? []}
        loading={false}
        assetName={asset === "gold" ? "Gold" : "Silver"}
        onRefresh={() => { setActiveTab("forecast"); onForecast(); }}
        forecasting={forecasting}
        forecastStartTime={forecastStartTime}
      />
    </div>
  );

  const tabContent = { chart: ChartTab, events: EventsTab, forecast: ForecastTab, news: NewsTabContent, settings: SettingsTab };

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      {...pullContainerProps}
    >
      {/* Scrollable content area — padded above tab bar */}
      <div
        className="px-4 pb-4"
        style={{
          paddingTop: "calc(1.25rem + env(safe-area-inset-top))",
          paddingBottom: `calc(${tabBarHeight} + 1rem)`,
        }}
      >
        {/* Page title */}
        <header className="mb-5">
          <h1 className={`text-2xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${
            asset === "gold"
              ? "from-yellow-700 via-amber-600 to-yellow-800 dark:from-yellow-200 dark:via-yellow-400 dark:to-yellow-600"
              : "from-slate-700 via-slate-500 to-slate-700 dark:from-white dark:via-slate-200 dark:to-slate-400"
          }`}>
            {asset === "gold" ? "Gold" : "Silver"} Intelligence
          </h1>
        </header>

        {tabContent[activeTab]}
      </div>

      {/* Fixed bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-background/95 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-14">
          {TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}