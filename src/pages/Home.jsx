import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { analysisStore } from "@/lib/analysisStore";
import { rebin, detectPeaks, detectDips } from "@/lib/peakDetection";
import Controls from "@/components/silver/Controls";
import SilverChart from "@/components/silver/SilverChart";
import PsdChart from "@/components/silver/PsdChart";
import PeakCard from "@/components/silver/PeakCard";
import ForecastPanel from "@/components/silver/ForecastPanel";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile, useForceDesktop } from "@/hooks/use-mobile";
import MobileLayout from "@/components/silver/MobileLayout";
import { Loader2, AlertCircle, Settings, RefreshCw, Sun, Moon, Radio, Smartphone, Newspaper, LogIn, LogOut, Zap, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import NewsRibbon from "@/components/silver/NewsRibbon";
import NewsTab from "@/components/silver/NewsTab";
import ProUpsellBanner from "@/components/silver/ProUpsellBanner";
import SavedReports from "@/components/silver/SavedReports";
import HeroSection from "@/components/silver/HeroSection";
import GoogleAd from "@/components/GoogleAd";
import ControlsBottom from "@/components/silver/ControlsBottom";
import EventSortControl, { sortEvents } from "@/components/silver/EventSortControl";
import AccountSettingsDialog from "@/components/silver/AccountSettingsDialog";
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

const today = new Date().toISOString().slice(0, 10);
const tenYearsAgo = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 30);
  return d.toISOString().slice(0, 10);
})();

// For long ranges, use weekly interval to keep data manageable.
function intervalFor(from, to) {
  const days = (new Date(to) - new Date(from)) / 86400000;
  return days > 730 ? "1wk" : "1d";
}

function cacheKey(asset) { return `argensci_state_${asset}`; }

function loadCache(asset) {
  try {
    const s = sessionStorage.getItem(cacheKey(asset));
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function saveCache(asset, state) {
  try { sessionStorage.setItem(cacheKey(asset), JSON.stringify(state)); } catch {}
}

export default function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated, logout } = useAuth();

  const activeTab = searchParams.get("tab") || "chart";
  const setActiveTab = (newTab) =>
    setSearchParams((prev) => { prev.set("tab", newTab); return prev; }, { replace: true });

  // Detect the asset first (from any cached key) to seed the right cache
  const initialAsset = (() => {
    try {
      for (const a of ["silver", "gold"]) {
        const s = sessionStorage.getItem(cacheKey(a));
        if (s) return JSON.parse(s).asset ?? a;
      }
    } catch {}
    return "silver";
  })();

  const cache = loadCache(initialAsset);

  const [asset, setAsset] = useState(cache?.asset ?? initialAsset);
  const [dateFrom, setDateFrom] = useState(cache?.dateFrom ?? tenYearsAgo);
  const [dateTo, setDateTo] = useState(cache?.dateTo ?? today);
  const [binSize, setBinSize] = useState(cache?.binSize ?? 1);
  const [prominencePct, setProminencePct] = useState(cache?.prominencePct ?? 5);

  const [rawData, setRawData] = useState(cache?.rawData ?? null);
  const [loadingData, setLoadingData] = useState(!cache?.rawData);
  // Stable full-history dataset used exclusively by the forecasting engine
  const [forecastRawPoints, setForecastRawPoints] = useState(null);
  const [dataError, setDataError] = useState(null);

  // Sync analyses from module-level store — seeded from localStorage on first load
  const [analyses, setAnalyses] = useState(() => {
    analysisStore.setAsset(asset); // ensure store is on the right asset at init
    return { ...analysisStore.analyses };
  });
  const [analyzing, setAnalyzing] = useState(analysisStore.isAnalyzing);
  const [refreshKey, setRefreshKey] = useState(0);
  // Per-asset forecast results — keyed by asset name, persisted to localStorage
  const [forecastResults, setForecastResults] = useState(() => {
    try {
      // Prefer sessionStorage (same-tab freshest), fall back to localStorage
      const s = sessionStorage.getItem("argensci_forecast_results") || localStorage.getItem("argensci_forecast_results");
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });
  const [forecastDays, setForecastDays] = useState(() => {
    try {
      const s = sessionStorage.getItem("argensci_forecast_results") || localStorage.getItem("argensci_forecast_results");
      if (s) {
        const parsed = JSON.parse(s);
        const assetKey = cache?.asset ?? "silver";
        return parsed[assetKey]?.forecastDays ?? 130;
      }
    } catch {}
    return 130;
  });
  const [credits, setCredits] = useState(null); // null = not yet loaded
  const [forecasting, setForecasting] = useState(false);
  const [forecastError, setForecastError] = useState(null);
  const [forecastStartTime, setForecastStartTime] = useState(null);
  const [forecastRunKey, setForecastRunKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  // Live spot price updated silently — separate from rawData so binning never re-runs
  const [liveSpot, setLiveSpot] = useState(null);

  // Grant 3 free credits to new authenticated users and load current balance
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const hasReceived = user.hasReceivedInitialCredits === true;
    const currentCredits = typeof user.credits === 'number' ? user.credits : null;
    if (!hasReceived) {
      // First-time user — only grant if they genuinely have no credits record yet
      // Use max() so an existing balance (a legacy purchase, or an admin grant)
      // isn't clobbered down to the default by the initial grant
      const grantedCredits = Math.max(currentCredits ?? 0, 3);
      base44.auth.updateMe({ credits: grantedCredits, hasReceivedInitialCredits: true })
        .then(() => setCredits(grantedCredits))
        .catch(() => setCredits(currentCredits ?? 0));
    } else {
      setCredits(currentCredits ?? 0);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    // On mount, pick up any analyses that completed while we were away
    setAnalyses({ ...analysisStore.analyses });
    setAnalyzing(analysisStore.isAnalyzing);

    // Re-hydrate forecast results from sessionStorage (freshest) or localStorage
    try {
      const s = sessionStorage.getItem("argensci_forecast_results") || localStorage.getItem("argensci_forecast_results");
      if (s) setForecastResults(JSON.parse(s));
    } catch {}

    const unsub = analysisStore.subscribe((updated) => setAnalyses(updated));
    const unsubAnalyzing = analysisStore.subscribeAnalyzing((val) => setAnalyzing(val));
    return () => { unsub(); unsubAnalyzing(); };
  }, []);

  // Persist state to sessionStorage whenever key values change (per-asset key)
  useEffect(() => {
    if (rawData) saveCache(asset, { asset, dateFrom, dateTo, binSize, prominencePct, rawData });
  }, [asset, dateFrom, dateTo, binSize, prominencePct, rawData]);

  // Persist forecast results (including news_ribbon) to localStorage + sessionStorage
  useEffect(() => {
    try {
      const s = JSON.stringify(forecastResults);
      localStorage.setItem("argensci_forecast_results", s);
      sessionStorage.setItem("argensci_forecast_results", s);
    } catch {}
  }, [forecastResults]);

  // Pull-to-refresh
  const [isPulling, setIsPulling] = useState(false);
  const [pullOffset, setPullOffset] = useState(0);
  const pullStartY = useRef(0);
  const pullContainerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (window.scrollY === 0) pullStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (pullStartY.current === 0 || window.scrollY > 0) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) setPullOffset(delta);
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const delta = e.changedTouches[0].clientY - pullStartY.current;
    setPullOffset(0);
    pullStartY.current = 0;
    if (delta > 70 && window.scrollY === 0) {
      setIsPulling(true);
      setRawData(null);
      setLoadingData(true);
      setDataError(null);
      analysisStore.notifyAnalyzing(false);
      const interval = intervalFor(dateFrom, dateTo);
      base44.functions
        .invoke("fetchSilverPrices", { asset, dateFrom, dateTo, interval })
        .then((res) => {
          const data = res.data;
          if (data?.error) throw new Error(data.error);
          setRawData(data);
        })
        .catch((e) => setDataError(e.message || "Failed to load silver prices"))
        .finally(() => { setLoadingData(false); setIsPulling(false); });
    }
  }, [dateFrom, dateTo]);

  // Derived: forecast for the currently active asset
  const forecastResult = forecastResults[asset] ?? null;
  const setForecastResult = (val) =>
    setForecastResults((prev) => ({
      ...prev,
      [asset]: typeof val === "function" ? val(prev[asset] ?? null) : val,
    }));

  // Reload persisted analyses when asset changes (skip on initial mount — store already seeded)
  const prevAssetRef = useRef(null);
  useEffect(() => {
    if (prevAssetRef.current !== null) {
      analysisStore.setAsset(asset);
      setAnalyses({ ...analysisStore.analyses });
    }
    prevAssetRef.current = asset;
    setForecastRawPoints(null);
    setLiveSpot(null);
    // Restore forecastDays for the newly selected asset
    try {
      const s = sessionStorage.getItem("argensci_forecast_results") || localStorage.getItem("argensci_forecast_results");
      if (s) {
        const parsed = JSON.parse(s);
        if (parsed[asset]?.forecastDays) setForecastDays(parsed[asset].forecastDays);
      }
    } catch {}
  }, [asset]);

  // Fetch stable 5-year daily dataset for forecasting — independent of chart range
  useEffect(() => {
    const forecastFrom = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 5); return d.toISOString().slice(0, 10); })();
    const forecastTo = new Date().toISOString().slice(0, 10);
    base44.functions
      .invoke("fetchSilverPrices", { asset, dateFrom: forecastFrom, dateTo: forecastTo, interval: "1d" })
      .then((res) => {
        const data = res.data;
        if (data?.error || !data?.points?.length) return;
        setForecastRawPoints(data.points);
      })
      .catch(() => {});
  }, [asset]);

  // Fetch on date range / asset change — skip if we already have cached data for this range
  const lastFetchedRef = useRef(cache ? `${cache.asset ?? initialAsset}_${cache.dateFrom}_${cache.dateTo}` : null);
  useEffect(() => {
    const key = `${asset}_${dateFrom}_${dateTo}`;
    if (refreshKey === 0 && lastFetchedRef.current === key && rawData) return;
    lastFetchedRef.current = key;
    let cancelled = false;
    setLoadingData(true);
    setDataError(null);
    analysisStore.isCancelled = true; // stop any running analysis
    analysisStore.notifyAnalyzing(false);
    const interval = intervalFor(dateFrom, dateTo);
    base44.functions
      .invoke("fetchSilverPrices", { asset, dateFrom, dateTo, interval })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        if (data?.error) throw new Error(data.error);
        setRawData(data);
        setLastUpdated(new Date());
      })
      .catch((e) => !cancelled && setDataError(e.message || "Failed to load silver prices"))
      .finally(() => !cancelled && setLoadingData(false));
    return () => { cancelled = true; };
  }, [asset, dateFrom, dateTo, refreshKey]);

  const points = rawData?.points || [];

  // Automatically widen bin for very long datasets to keep chart readable.
  const autoBinHint = useMemo(() => {
    if (points.length > 500) return Math.ceil(points.length / 200);
    return 1;
  }, [points.length]);

  const binned = useMemo(() => rebin(points, binSize), [points, binSize]);
  const opts = useMemo(
    () => ({ minProminencePct: prominencePct / 100, distance: 2 }),
    [prominencePct]
  );
  const peaks = useMemo(() => detectPeaks(binned, opts), [binned, opts]);
  const dips = useMemo(() => detectDips(binned, opts), [binned, opts]);

  const topPeaks = useMemo(
    () => [...peaks].sort((a, b) => b.prominence - a.prominence).slice(0, 12),
    [peaks]
  );
  const topDips = useMemo(
    () => [...dips].sort((a, b) => b.prominence - a.prominence).slice(0, 12),
    [dips]
  );
  const [eventSortOrder, setEventSortOrder] = useState("prominence");
  const [eventsOpen, setEventsOpen] = useState(true);
  const [newsOpen, setNewsOpen] = useState(true);
  const [psdOpen, setPsdOpen] = useState(false);

  const allEvents = useMemo(
    () => [
      ...topPeaks.map((p) => ({ ...p, eventType: "peak" })),
      ...topDips.map((d) => ({ ...d, eventType: "dip" })),
    ],
    [topPeaks, topDips]
  );

  const sortedEvents = useMemo(
    () => sortEvents(allEvents, eventSortOrder, analyses),
    [allEvents, eventSortOrder, analyses]
  );

  // When the event list changes, prune analyses that no longer correspond to any visible event
  // But only after data has loaded (allEvents populated) and only if there's something to prune
  useEffect(() => {
    if (allEvents.length === 0 || loadingData) return;
    const currentKeys = new Set(allEvents.map((e) => `${e.date}_${e.eventType}`));
    const staleKeys = Object.keys(analysisStore.analyses).filter((k) => !currentKeys.has(k));
    if (staleKeys.length > 0) {
      analysisStore.pruneToEvents([...currentKeys]);
    }
  }, [allEvents, loadingData]);

  const forecastAbortRef = useRef(null);
  const forecastInFlightRef = useRef(false); // prevent concurrent duplicate calls
  const dashboardRef = useRef(null);

  const handleForecast = useCallback(async (overrideDays) => {
    // Hard guard: if a forecast is already in-flight, silently ignore the duplicate call
    if (forecastInFlightRef.current) return;
    const days = overrideDays ?? forecastDays;
    base44.analytics.track({ eventName: "forecast_run", properties: { asset, forecast_days: days } });
    // Prefer the dedicated 5-year daily dataset; fall back to chart points if sufficient
    const calibrationPoints = (forecastRawPoints?.length >= 30 ? forecastRawPoints : null)
      ?? (points.length >= 30 ? points : null);
    if (!calibrationPoints) {
      setDataError("Not enough price data to generate a forecast yet — please wait a moment and try again.");
      return;
    }
    forecastInFlightRef.current = true;
    setForecasting(true);
    setForecastStartTime(Date.now());
    setDataError(null);
    setForecastError(null);
    setForecastRunKey(k => k + 1);
    // Clear stale report immediately so user never reads outdated data while new one loads
    setForecastResult(null);
    // Clear persisted external consensus for this asset so it re-fetches on demand
    try {
      const stored = JSON.parse(localStorage.getItem("argensci_external_consensus") || "{}");
      Object.keys(stored).filter(k => k.startsWith(asset)).forEach(k => delete stored[k]);
      localStorage.setItem("argensci_external_consensus", JSON.stringify(stored));
    } catch {}
    const abortController = new AbortController();
    forecastAbortRef.current = abortController;
    const currentPrice = rawData?.regularMarketPrice ?? calibrationPoints[calibrationPoints.length - 1]?.close;
    const payload = {
      asset,
      points: calibrationPoints.slice(-1260),
      currentPrice,
      forecastDays: days,
    };

    try {
      let res;
      if (isAuthenticated) {
        // Pro path: credit-gated, auto-saves report
        res = await base44.functions.invoke("runProAnalysis", payload);
        if (abortController.signal.aborted) return;
        if (res.data?.error) throw new Error(res.data.error);
        // Update local credit count from response
        if (typeof res.data?._creditsRemaining === 'number') {
          setCredits(res.data._creditsRemaining);
        }
        // Auto-save the Pro report
        try {
          const defaultLabel = `Pro · ${asset === "gold" ? "Gold" : "Silver"} · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
          const snapshotStr = JSON.stringify(res.data);
          const file = new File([snapshotStr], "snapshot.json", { type: "application/json" });
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          await base44.entities.AnalysisReport.create({
            asset,
            label: defaultLabel,
            forecastDays: days,
            tier: "pro",
            snapshot: file_url,
            snapshot_date: new Date().toISOString(),
          });
        } catch (e) {
          console.warn("Auto-save failed:", e);
        }
      } else {
        // Lite path: free, unlimited, no save
        res = await base44.functions.invoke("marketIntelligence", { ...payload, lite: true });
        if (abortController.signal.aborted) return;
        if (res.data?.error) throw new Error(res.data.error);
      }
      setForecastResult(res.data);
    } catch (e) {
      if (!abortController.signal.aborted) {
        const msg = e.message || "Market Intelligence failed — please try again.";
        // 402 = out of credits. Purchasing was removed, so there is no action the
        // user can take — report it plainly instead of offering a dead end.
        if (msg.includes("No credits") || msg.includes("402")) {
          setCredits(0);
          const outOfCredits = "You have no Pro credits left. Lite forecasts remain available.";
          setDataError(outOfCredits);
          setForecastError(outOfCredits);
        } else if (msg.includes("already in progress") || msg.includes("429")) {
          // Duplicate request blocked by server — silently ignore, forecast is already running
          console.info("[handleForecast] Duplicate blocked by server");
        } else {
          setDataError(msg);
          setForecastError(msg);
        }
      }
    } finally {
      forecastInFlightRef.current = false;
      if (!abortController.signal.aborted) setForecasting(false);
    }
  }, [asset, points, rawData, forecastRawPoints, forecastDays, isAuthenticated]);

  const handleCancelForecast = useCallback(() => {
    forecastAbortRef.current?.abort();
    setForecasting(false);
  }, []);

  const handleClearForecast = useCallback(() => {
    setForecastResult(null);
    setForecastRunKey((k) => k + 1);
  }, []);

  // Recompute GBM cone client-side from fresh spot + points — no backend call needed.
  // Mirrors the math in marketIntelligence/entry.ts exactly.
  const recomputeCone = useCallback((freshPoints, freshSpot, existingResult) => {
    if (!existingResult || freshPoints.length < 30) return existingResult;
    const datedPoints = freshPoints.filter((p) => p.date && p.close > 0);
    const closes = datedPoints.map((p) => p.close);
    const logReturns = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0 && closes[i] > 0) logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const n = logReturns.length;
    if (n < 2) return existingResult;

    // Detect frequency
    const gaps = [];
    for (let i = 1; i < Math.min(datedPoints.length, 20); i++) {
      const g = (new Date(datedPoints[i].date) - new Date(datedPoints[i - 1].date)) / 86400000;
      if (g > 0) gaps.push(g);
    }
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 1;
    const tpy = avgGap <= 3 ? 252 : avgGap <= 10 ? 52 : 12;

    const muPeriod = logReturns.reduce((s, r) => s + r, 0) / n;
    const variancePeriod = logReturns.reduce((s, r) => s + (r - muPeriod) ** 2, 0) / (n - 1);
    const mu = muPeriod * tpy;
    const sigma = Math.sqrt(variancePeriod) * Math.sqrt(tpy);
    const logDrift = mu - 0.5 * sigma * sigma;
    const dampedDrift = Math.abs(logDrift) > 0.5 ? 0.5 * logDrift : logDrift;

    const FAT_Z1 = 1.53;
    const FAT_Z2 = 2.78;
    const spot = freshSpot ?? closes[closes.length - 1];
    const steps = existingResult.forecastDays ?? 90;
    const today = new Date();
    const forecastPoints = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / 252;
      const sqrtT = Math.sqrt(t);
      const central = spot * Math.exp(dampedDrift * t);
      const d = new Date(today);
      d.setDate(d.getDate() + Math.round(i * (365 / 252)));
      forecastPoints.push({
        date: d.toISOString().slice(0, 10),
        central: Math.round(central * 100) / 100,
        upper1: Math.round(central * Math.exp(sigma * sqrtT * FAT_Z1) * 100) / 100,
        upper2: Math.round(central * Math.exp(sigma * sqrtT * FAT_Z2) * 100) / 100,
        lower1: Math.round(central * Math.exp(-sigma * sqrtT * FAT_Z1) * 100) / 100,
        lower2: Math.round(central * Math.exp(-sigma * sqrtT * FAT_Z2) * 100) / 100,
      });
    }
    return {
      ...existingResult,
      spot,
      quant: { ...existingResult.quant, forecastPoints, annualisedVol: Math.round(sigma * 10000) / 100, annualisedDrift: Math.round(mu * 10000) / 100, dampedLogDrift: Math.round(dampedDrift * 10000) / 100 },
    };
  }, []);

  // 30-second silent background refresh of price data + cone
  const autoRefreshTimerRef = useRef(null);
  const isFetchingRef = useRef(false);

  const doSilentRefresh = useCallback(() => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setAutoRefreshing(true);
    // Fetch only the latest 5 days to get the current spot price — does NOT touch rawData
    const recentFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 5); return d.toISOString().slice(0, 10); })();
    const recentTo = new Date().toISOString().slice(0, 10);
    base44.functions
      .invoke("fetchSilverPrices", { asset, dateFrom: recentFrom, dateTo: recentTo, interval: "1d" })
      .then((res) => {
        const data = res.data;
        if (data?.error) return;
        const freshSpot = data.regularMarketPrice;
        if (freshSpot) {
          setLiveSpot(freshSpot);
          setLastUpdated(new Date());
          // Recompute cone from existing rawData points + fresh spot — never re-bins
          setForecastResults((prev) => {
            const current = prev[asset] ?? null;
            if (!current) return prev;
            const calibration = (forecastRawPoints ?? rawData?.points ?? []).slice(-1260);
            return { ...prev, [asset]: recomputeCone(calibration, freshSpot, current) };
          });
        }
      })
      .catch(() => {})
      .finally(() => { isFetchingRef.current = false; setAutoRefreshing(false); });
  }, [asset, rawData, forecastRawPoints, recomputeCone]);

  // Start/restart the 30s interval when enabled
  useEffect(() => {
    clearInterval(autoRefreshTimerRef.current);
    if (autoRefreshEnabled) {
      autoRefreshTimerRef.current = setInterval(doSilentRefresh, 30000);
    }
    return () => clearInterval(autoRefreshTimerRef.current);
  }, [doSilentRefresh, autoRefreshEnabled]);

  const handleCancel = useCallback(() => {
    analysisStore.isCancelled = true;
    analysisStore.notifyAnalyzing(false);
  }, []);

  const analyzeSingle = useCallback(async (p) => {
    const eventKey = `${p.date}_${p.eventType}`;
    if (analyses[eventKey]) return;
    const abortController = new AbortController();
    analysisStore.eventAborts[eventKey] = abortController;
    // Mark as in-flight by setting analyzing on just this event via a loading sentinel
    analysisStore.set(eventKey, { event_date: p.date, event_type: p.eventType, _loading: true });
    const assetName = asset === "gold" ? "Gold" : "Silver";
    const prompt = `You are a macroeconomics and commodities analyst with deep knowledge of precious metals markets.

Analyze this single ${assetName} price event:
- Type: ${p.eventType.toUpperCase()} (${p.eventType === "peak" ? "local price high" : "local price low"})
- Date: ${p.date}
- ${assetName} price: $${p.close?.toFixed(2)}/oz
- Move vs prior: ${p.pctChange >= 0 ? "+" : ""}${p.pctChange?.toFixed(1)}%
- Prominence: ${p.prominencePct?.toFixed(1)}% of price range${p.binStart && p.binStart !== p.binEnd ? `\n- Period: ${p.binStart} to ${p.binEnd}` : ""}

Use your knowledge and live web search to identify real-world news and macro factors that explain why ${assetName} reached this ${p.eventType} around that date.

${p.eventType === "peak"
  ? "Consider: Fed rate-cut expectations, dollar weakness, inflation, geopolitical tensions, safe-haven demand, solar/industrial demand, supply disruptions, gold correlation, ETF inflows."
  : "Consider: rate hike fears, dollar strength, recession fears, industrial demand weakness, profit-taking, supply gluts, ETF outflows, margin calls."}

Return a JSON object with:
- event_date: "${p.date}"
- event_type: "${p.eventType}"
- key_news_event: short headline of the single most likely driver
- primary_explanation: 2-4 sentences with concrete reasoning
- confidence: "high" | "medium" | "low"
- confidence_reason: one sentence explaining confidence level
- alternative_scenarios: array of 1-3 objects, each with "scenario" (string) and "likelihood" ("high"|"medium"|"low")`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
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
            alternative_scenarios: { type: "array", items: { type: "object", properties: { scenario: { type: "string" }, likelihood: { type: "string", enum: ["high", "medium", "low"] } } } },
          },
          required: ["event_date", "event_type", "primary_explanation", "confidence"],
        },
      });
      if (abortController.signal.aborted) return;
      if (result?.event_date) analysisStore.set(`${result.event_date}_${result.event_type}`, result);
    } catch {
      // clear the loading sentinel on failure
      analysisStore.set(eventKey, { event_date: p.date, event_type: p.eventType, _cancelled: true, primary_explanation: "Analysis failed.", confidence: "low" });
    } finally {
      delete analysisStore.eventAborts[eventKey];
    }
  }, [asset, analyses]);

  const handleCancelEvent = useCallback((date, eventType) => {
    const key = `${date}_${eventType}`;
    analysisStore.eventAborts[key]?.abort();
    delete analysisStore.eventAborts[key];
    // Mark event as cancelled so the spinner clears immediately (InvokeLLM can't be truly aborted)
    analysisStore.set(key, { event_date: date, event_type: eventType, _cancelled: true, primary_explanation: "Analysis cancelled.", confidence: "low" });
  }, []);

  const analyze = useCallback(async () => {
    if (allEvents.length === 0) return;
    base44.analytics.track({ eventName: "events_bulk_analyze", properties: { asset, event_count: allEvents.length } });
    analysisStore.isCancelled = false;
    analysisStore.reset();
    analysisStore.notifyAnalyzing(true);

    const analyzeOne = async (p) => {
      if (analysisStore.isCancelled) return;
      const eventKey = `${p.date}_${p.eventType}`;
      const abortController = new AbortController();
      analysisStore.eventAborts[eventKey] = abortController;
      const assetName = asset === "gold" ? "Gold" : "Silver";
      const prompt = `You are a macroeconomics and commodities analyst with deep knowledge of precious metals markets.

Analyze this single ${assetName} price event:
- Type: ${p.eventType.toUpperCase()} (${p.eventType === "peak" ? "local price high" : "local price low"})
- Date: ${p.date}
- ${assetName} price: $${p.close?.toFixed(2)}/oz
- Move vs prior: ${p.pctChange >= 0 ? "+" : ""}${p.pctChange?.toFixed(1)}%
- Prominence: ${p.prominencePct?.toFixed(1)}% of price range${p.binStart && p.binStart !== p.binEnd ? `\n- Period: ${p.binStart} to ${p.binEnd}` : ""}

Use your knowledge and live web search to identify real-world news and macro factors that explain why ${assetName} reached this ${p.eventType} around that date.

${p.eventType === "peak"
  ? "Consider: Fed rate-cut expectations, dollar weakness, inflation, geopolitical tensions, safe-haven demand, solar/industrial demand, supply disruptions, gold correlation, ETF inflows."
  : "Consider: rate hike fears, dollar strength, recession fears, industrial demand weakness, profit-taking, supply gluts, ETF outflows, margin calls."}

Return a JSON object with:
- event_date: "${p.date}"
- event_type: "${p.eventType}"
- key_news_event: short headline of the single most likely driver
- primary_explanation: 2-4 sentences with concrete reasoning
- confidence: "high" | "medium" | "low"
- confidence_reason: one sentence explaining confidence level
- alternative_scenarios: array of 1-3 objects, each with "scenario" (string) and "likelihood" ("high"|"medium"|"low")`;

      try {
        const result = await base44.integrations.Core.InvokeLLM({
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
        });
        if (analysisStore.isCancelled || abortController.signal.aborted) return;
        if (result?.event_date) {
          analysisStore.set(`${result.event_date}_${result.event_type}`, result);
        }
      } catch {
        // silently skip failed individual events
      } finally {
        delete analysisStore.eventAborts[eventKey];
      }
    };

    try {
      await Promise.all(allEvents.map(analyzeOne));
    } finally {
      if (!analysisStore.isCancelled) {
        analysisStore.notifyAnalyzing(false);
      }
    }
  }, [allEvents]);

  const handleZoom = useCallback((from, to) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const handleResetZoom = useCallback(() => {
    setDateFrom(tenYearsAgo);
    setDateTo(today);
  }, []);

  const isZoomed = dateFrom !== tenYearsAgo || dateTo !== today;

  const handleDotClick = useCallback(
    (index, type) => {
      const list = type === "peak" ? topPeaks : topDips;
      const point = list.find((p) => p.index === index);
      if (!point) return;
      const key = `silver_event_${point.date}_${type}`;
      const analysis = analyses[`${point.date}_${type}`] || null;
      sessionStorage.setItem(key, JSON.stringify({ point, analysis }));
      navigate(`/event?date=${point.date}&type=${type}&asset=${asset}`);
    },
    [topPeaks, topDips, analyses, navigate, asset]
  );

  const handleCardDetailClick = useCallback(
    (point, type) => {
      base44.analytics.track({ eventName: "event_detail_viewed", properties: { asset, event_type: type, event_date: point.date } });
      const key = `silver_event_${point.date}_${type}`;
      const analysis = analyses[`${point.date}_${type}`] || null;
      sessionStorage.setItem(key, JSON.stringify({ point, analysis }));
      navigate(`/event?date=${point.date}&type=${type}&asset=${asset}`);
    },
    [analyses, navigate, asset]
  );

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleDark = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
  };

  // News headlines — extracted from forecastResult per asset
  const newsHeadlines = forecastResult?.intelligence?.news_ribbon ?? [];

  const spot = liveSpot ?? rawData?.regularMarketPrice;
  const previousClose = rawData?.previousClose ?? null;
  const spotChangePct = spot != null && previousClose != null && previousClose > 0
    ? ((spot - previousClose) / previousClose) * 100
    : null;
  const isMobile = useIsMobile();
  const [forceDesktop, setForceDesktop] = useForceDesktop();
  const isActuallyMobile = window.innerWidth < 768;

  // ── Mobile branch ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <MobileLayout
        asset={asset}         setAsset={(a) => { setAsset(a); sessionStorage.removeItem(cacheKey(a)); analysisStore.notifyAnalyzing(false); setRawData(null); setLiveSpot(null); }}
        binned={binned} peaks={peaks} dips={dips}
        forecastResult={forecastResult} setForecastResult={setForecastResult}
        forecasting={forecasting} analyzing={analyzing}
        allEvents={allEvents} analyses={analyses}
        loadingData={loadingData}
        spot={spot} spotChangePct={spotChangePct} autoRefreshing={autoRefreshing} autoRefreshEnabled={autoRefreshEnabled} setAutoRefreshEnabled={setAutoRefreshEnabled} lastUpdated={lastUpdated}
        autoBinHint={autoBinHint}
        binSize={binSize} setBinSize={setBinSize}
        prominencePct={prominencePct} setProminencePct={setProminencePct}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
        onDotClick={handleDotClick} onZoom={handleZoom} onReset={handleResetZoom} isZoomed={isZoomed}
        onAnalyze={analyze} onCancel={handleCancel} onCancelEvent={handleCancelEvent}
        onForecast={handleForecast} onCancelForecast={handleCancelForecast} onClearForecast={handleClearForecast}
        forecastDays={forecastDays} setForecastDays={setForecastDays}
        forecastStartTime={forecastStartTime}
        forecastRunKey={forecastRunKey}
        forecastError={forecastError}
        onCardDetailClick={handleCardDetailClick}
        newsHeadlines={newsHeadlines}
        user={user} isAuthenticated={isAuthenticated} logout={logout}
        credits={credits}
        isDark={isDark} toggleDark={toggleDark}
        activeTab={activeTab} setActiveTab={setActiveTab}
        pullContainerProps={{
          ref: pullContainerRef,
          onTouchStart: handleTouchStart,
          onTouchMove: handleTouchMove,
          onTouchEnd: handleTouchEnd,
        }}
      />
    );
  }

  // ── Desktop branch ─────────────────────────────────────────────────────────
  const scrollToDashboard = () => dashboardRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div
      ref={pullContainerRef}
      className="min-h-screen bg-background text-foreground"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullOffset > 0 && (
        <div
          className="flex justify-center overflow-hidden transition-none"
          style={{ height: `${Math.min(pullOffset, 60)}px` }}
        >
          <RefreshCw
            className="h-5 w-5 text-slate-500 self-center"
            style={{
              transform: `rotate(${Math.min(pullOffset / 60, 1) * 360}deg)`,
              opacity: Math.min(pullOffset / 40, 1),
            }}
          />
        </div>
      )}
      {isPulling && (
        <div className="flex justify-center pt-2">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      )}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-amber-400/5 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-96 w-96 rounded-full bg-slate-400/5 blur-3xl" />
      </div>

      <HeroSection onEnter={scrollToDashboard} isAuthenticated={isAuthenticated} />

      <div ref={dashboardRef} className="relative mx-auto max-w-6xl px-4 sm:px-6" style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))", paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] ${asset === "gold" ? "text-yellow-600 dark:text-yellow-400/80" : "text-amber-300/80"}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${asset === "gold" ? "bg-yellow-400" : "bg-amber-300"}`} />
                Commodities Intelligence
              </div>
              <h1 className={`mt-3 text-3xl sm:text-4xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${asset === "gold" ? "from-yellow-700 via-amber-600 to-yellow-800 dark:from-yellow-200 dark:via-yellow-400 dark:to-yellow-600" : "from-slate-700 via-slate-500 to-slate-700 dark:from-white dark:via-slate-200 dark:to-slate-400"}`}>
                {asset === "gold" ? "Gold" : "Silver"} Peak Intelligence
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {/* Asset toggle */}
              <div className="flex rounded-xl border border-border overflow-hidden">
                {["silver", "gold"].map((a) => {
                  const isActive = asset === a;
                  const isGold = a === "gold";
                  return (
                  <button
                    key={a}
                    onClick={() => {
                      if (a === asset) return;
                      setAsset(a);
                      sessionStorage.removeItem(cacheKey(a));
                      setRawData(null);
                      setLiveSpot(null);
                    }}
                    className={`min-h-[44px] px-4 text-sm font-medium capitalize transition-colors ${
                      isActive
                        ? isGold
                          ? "bg-yellow-400/15 text-yellow-600 dark:text-yellow-300"
                          : "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-100"
                        : "bg-white/[0.03] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {a}
                  </button>
                  );
                })}
              </div>
              {isActuallyMobile && forceDesktop && (
                <button
                  onClick={() => setForceDesktop(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors"
                  title="Switch back to app mode"
                >
                  <Smartphone className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={toggleDark}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] transition-colors"
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                onClick={() => { sessionStorage.removeItem(cacheKey(asset)); setRefreshKey(k => k + 1); }}
                disabled={loadingData}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] transition-colors disabled:opacity-40"
                title="Refresh data"
              >
                <RefreshCw className={`h-5 w-5 ${loadingData ? "animate-spin" : ""}`} />
              </button>
              {isAuthenticated && credits !== null && (
                <span
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border text-sm font-semibold tabular-nums ${credits > 0 ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-rose-500/30 bg-rose-500/10 text-rose-400"}`}
                  title="Pro credits remaining"
                >
                  <Zap className="h-4 w-4" /> {credits} credit{credits !== 1 ? "s" : ""}
                </span>
              )}
              {!isAuthenticated && (
                <button
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-medium transition-colors"
                >
                  <LogIn className="h-4 w-4" /> Sign in
                </button>
              )}
              {isAuthenticated && (
                <AccountSettingsDialog user={user} credits={credits} logout={logout} />
              )}
            </div>
          </div>
          <p className={`mt-2 max-w-2xl text-sm leading-relaxed ${asset === "gold" ? "text-yellow-800/80 dark:text-yellow-200/60" : "text-slate-400"}`}>
            Multi-scale peak &amp; dip detection on silver spot prices, with each event
            explained by real-world news. Set any date range, adjust binning, and click
            any marker or card to view full details.
          </p>
          {spot != null && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
                <span className={`text-xs ${asset === "gold" ? "text-yellow-700 dark:text-yellow-400/60" : "text-slate-500"}`}>/oz · COMEX</span>
              </div>
              {spotChangePct != null && (
                <span className={`text-sm font-medium tabular-nums ${spotChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {spotChangePct >= 0 ? "+" : ""}{spotChangePct.toFixed(2)}%
                </span>
              )}
              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefreshEnabled((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  autoRefreshEnabled
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300"
                }`}
              >
                <Radio className="h-3 w-3" />
                {autoRefreshEnabled ? "Live on" : "Live off"}
              </button>
              {autoRefreshEnabled && lastUpdated && (
                <span className="text-xs text-slate-600 tabular-nums">
                  last {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              {autoBinHint > 1 && binSize < autoBinHint && (
                <button
                  onClick={() => setBinSize(autoBinHint)}
                  className="text-xs text-amber-400/70 hover:text-amber-400 underline underline-offset-2"
                >
                  Suggest bin {autoBinHint}
                </button>
              )}
            </div>
          )}
          {/* News ribbon — shows after first forecast */}
          {(newsHeadlines.length > 0 || forecasting) && (
            <div className="mt-3">
              <NewsRibbon headlines={newsHeadlines} loading={forecasting} />
            </div>
          )}
        </header>

        {dataError && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {dataError}
          </div>
        )}

        <div className="space-y-6">
          <Controls
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
          />

          {loadingData ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <SilverChart
              data={binned}
              peaks={peaks}
              dips={dips}
              onDotClick={handleDotClick}
              onZoom={handleZoom}
              onReset={handleResetZoom}
              isZoomed={isZoomed}
              forecastPoints={forecastResult?.quant?.forecastPoints}
              asset={asset}
              isAuthenticated={isAuthenticated}
              hasForecast={!!forecastResult}
              isLiteForecast={!!forecastResult?.lite}
              onRerun={handleForecast}
            />
          )}

          {/* PSD collapsible — always visible, updates when forecast is added */}
          {!loadingData && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <button
                onClick={() => setPsdOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-violet-400/70" />
                  <span className="text-sm font-medium text-slate-300">Spectral Analysis (PSD)</span>
                  <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-400">Beta</span>
                </span>
                <span className="flex items-center gap-2 text-[11px] text-slate-600">
                  {!psdOpen && <span>Click to explore frequency cycles</span>}
                  {psdOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                </span>
              </button>
              {psdOpen && (
                <div className="px-5 pb-5 border-t border-white/5">
                  <p className="text-[11px] text-violet-400/60 mt-3 mb-3 flex items-center gap-1.5">
                    <FlaskConical className="h-3 w-3" /> Beta feature — experimental spectral decomposition. Interpret with caution.
                  </p>
                  <PsdChart
                    binnedPoints={binned}
                    forecastPoints={forecastResult?.quant?.forecastPoints}
                  />
                </div>
              )}
            </div>
          )}

          {/* Ad slot for unauthenticated (Lite) users — right under chart */}
          {!isAuthenticated && <GoogleAd />}

          {/* Forecast error banner — shown when a run fails so stale data is never silently shown */}
          {forecastError && !forecasting && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-start gap-2 text-sm text-rose-300">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <div className="flex-1">
                <p className="font-semibold">Forecast failed — no report was generated</p>
                <p className="text-xs text-rose-400/70 mt-0.5">{forecastError}</p>
              </div>
            </div>
          )}

          {/* Controls: sliders, buttons, structural drivers — below chart */}
          <ControlsBottom
            asset={asset}
            binSize={binSize}
            setBinSize={setBinSize}
            prominencePct={prominencePct}
            setProminencePct={setProminencePct}
            onAnalyze={analyze}
            onCancel={handleCancel}
            analyzing={analyzing}
            peakCount={topPeaks.length}
            dipCount={topDips.length}
            onForecast={handleForecast}
            forecasting={forecasting}
            onCancelForecast={handleCancelForecast}
            onClearForecast={handleClearForecast}
            hasForecast={!!forecastResult}
            forecastDays={forecastDays}
            setForecastDays={setForecastDays}
            isAuthenticated={isAuthenticated}
            credits={credits}
          />

          {/* Ad slot placeholder — moved below chart */}

          {forecastResult && (
            <ForecastPanel
              result={forecastResult}
              onClose={() => setForecastResult(null)}
              onRerun={handleForecast}
              forecastDaysInput={forecastDays}
              priceHistory={binned}
              forecastRunKey={forecastRunKey}
              forecasting={forecasting}
              isAuthenticated={isAuthenticated}
            />
          )}

          <SavedReports
            asset={asset}
            isAuthenticated={isAuthenticated}
            currentResult={forecastResult}
            forecastDays={forecastDays}
            onLoad={(snapshot) => setForecastResult(snapshot)}
          />

          {/* News section — visible when forecast has run */}
          {(newsHeadlines.length > 0 || forecasting) && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <button
                onClick={() => setNewsOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
              >
                <span className="flex items-center gap-2 text-lg font-medium text-slate-700 dark:text-slate-200">
                  <Newspaper className="h-4 w-4 text-slate-500" />
                  {asset === "gold" ? "Gold" : "Silver"} Market Headlines
                </span>
                {newsOpen
                  ? <ChevronUp className="h-4 w-4 text-slate-500" />
                  : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>
              {newsOpen && (
                <div className="px-5 pb-5">
                  <NewsTab
                    headlines={newsHeadlines}
                    loading={false}
                    assetName={asset === "gold" ? "Gold" : "Silver"}
                    onRefresh={handleForecast}
                    forecasting={forecasting}
                    forecastStartTime={forecastStartTime}
                  />
                  {forecastResult?.lite && !forecasting && (
                    <div className="mt-4">
                      {isAuthenticated ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                            <p className="text-sm text-amber-300 font-medium">You're signed in — re-run for Pro analysis</p>
                          </div>
                          <button
                            onClick={() => handleForecast()}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300 transition-colors"
                          >
                            <Zap className="h-3 w-3" /> Run Pro
                          </button>
                        </div>
                      ) : (
                        <ProUpsellBanner />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!loadingData && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              {/* Collapsible header */}
              <button
                onClick={() => setEventsOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
              >
                <span className={`text-lg font-medium ${asset === "gold" ? "text-yellow-700 dark:text-yellow-200" : "text-slate-700 dark:text-slate-200"}`}>
                  Detected events
                  {allEvents.length > 0 && (
                    <span className={`ml-2 text-sm font-normal ${asset === "gold" ? "text-yellow-600/80 dark:text-yellow-400/50" : "text-slate-500"}`}>
                      {peaks.length} peaks · {dips.length} dips
                    </span>
                  )}
                </span>
                {eventsOpen
                  ? <ChevronUp className="h-4 w-4 text-slate-500" />
                  : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>

              {eventsOpen && (
                <div className="px-5 pb-5">
                  {allEvents.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                      No events clear the current prominence threshold.
                      Try lowering the threshold or adjusting the bin size.
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <EventSortControl value={eventSortOrder} onChange={setEventSortOrder} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
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
                              onDetailsClick={() => handleCardDetailClick(p, p.eventType)}
                              onCancelLoading={isLoadingThis ? () => handleCancelEvent(p.date, p.eventType) : undefined}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className={`mt-12 border-t border-white/5 pt-6 text-xs space-y-1 ${asset === "gold" ? "text-yellow-700/70 dark:text-yellow-400/30" : "text-slate-500 dark:text-slate-600"}`}>
          <p>
            Price data: COMEX silver futures (SI=F) via Yahoo Finance (daily &lt;2yr, weekly ≥2yr).
            Peak/dip detection uses topological prominence after user-selected binning. AI explanations
            use live web context — treat as guidance, not financial advice.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p>© {new Date().getFullYear()} ArgenSci. All rights reserved. Not financial advice.</p>
            <a href="/terms" className="hover:text-slate-400 underline underline-offset-2 transition-colors">Terms of Use</a>
          </div>
        </footer>
      </div>
    </div>
  );
}