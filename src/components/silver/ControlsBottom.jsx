import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Sparkles, Activity, Layers, X, BrainCircuit, Loader2, Trash2, Zap, Lock, BarChart2 } from "lucide-react";
import StructuralDriversPanel from "@/components/silver/StructuralDriversPanel";
import CreditHistory from "@/components/silver/CreditHistory";

const MIN_FORECAST = 7;
const MAX_FORECAST = 730;

export default function ControlsBottom({
  asset,
  binSize,
  setBinSize,
  prominencePct,
  setProminencePct,
  onAnalyze,
  onCancel,
  analyzing,
  peakCount,
  dipCount,
  onForecast,
  forecasting,
  onCancelForecast,
  onClearForecast,
  hasForecast,
  forecastDays,
  setForecastDays,
  isAuthenticated,
  credits,
}) {
  const navigate = useNavigate();
  const totalCount = peakCount + dipCount;
  const binLabel = binSize <= 1 ? "Daily (1 session)" : `${binSize} sessions`;
  const [draftDays, setDraftDays] = useState(String(forecastDays));
  const [daysError, setDaysError] = useState(null);
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

  useEffect(() => {
    if (forecasting) {
      setForecastProgress(0);
      setForecastPhase(PHASES[0].label);
      const start = Date.now();
      const DURATION = 60000;
      progressTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        setForecastProgress(Math.min(elapsed / (DURATION / 1000), 0.97));
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

  const prevForecastDays = useRef(forecastDays);
  useEffect(() => {
    if (forecastDays !== prevForecastDays.current) {
      setDraftDays(String(forecastDays));
      prevForecastDays.current = forecastDays;
    }
  }, [forecastDays]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 sm:p-6 space-y-5">
        {/* Credits banner */}
        {isAuthenticated && credits !== null && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${credits > 0 ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-rose-500/30 bg-rose-500/[0.06]"}`}>
            <Zap className={`h-4 w-4 shrink-0 ${credits > 0 ? "text-amber-400" : "text-rose-400"}`} />
            <span className={`text-sm font-semibold ${credits > 0 ? "text-amber-300" : "text-rose-300"}`}>
              {credits > 0 ? `${credits} Pro credit${credits !== 1 ? "s" : ""} remaining` : "No credits remaining — buy more to run Pro forecasts"}
            </span>
          </div>
        )}
        {/* Credit History */}
        {isAuthenticated && <CreditHistory isAuthenticated={isAuthenticated} />}

        {/* Sliders + buttons */}
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Layers className="h-4 w-4 text-slate-400" />
              Binning — analysis scale
            </div>
            <div className="flex items-center gap-4">
              <Slider
                value={[binSize]}
                onValueChange={(v) => setBinSize(v[0])}
                min={1}
                max={60}
                step={1}
                className="flex-1"
              />
              <span className="w-28 shrink-0 text-right text-sm tabular-nums text-slate-200">
                {binLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Smaller bins = short-lived spikes; larger bins = macro cycles.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Activity className="h-4 w-4 text-slate-400" />
              Prominence threshold
            </div>
            <div className="flex items-center gap-4">
              <Slider
                value={[prominencePct]}
                onValueChange={(v) => setProminencePct(v[0])}
                min={1}
                max={25}
                step={0.5}
                className="flex-1"
              />
              <span className="w-28 shrink-0 text-right text-sm tabular-nums text-slate-200">
                {prominencePct.toFixed(1)}% of range
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Adaptive prominence filter — scales with current price range.
            </p>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <Button
              onClick={onAnalyze}
              disabled={analyzing || forecasting || totalCount === 0}
              className="bg-gradient-to-r from-amber-200 to-slate-200 text-slate-900 hover:from-amber-100 hover:to-slate-100 font-medium shadow-lg shadow-amber-500/10"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {analyzing ? "Analyzing…" : `Explain ${totalCount} events`}
            </Button>
            <Button
              onClick={() => {
                if (isAuthenticated && credits !== null && credits < 1) {
                  alert("You have no credits remaining. Please buy more credits to run a Pro forecast.");
                  return;
                }
                const n = parseInt(draftDays, 10);
                if (isNaN(n) || n < MIN_FORECAST) { setDaysError(`Minimum ${MIN_FORECAST} days`); return; }
                if (n > MAX_FORECAST) { setDaysError(`Maximum ${MAX_FORECAST} days`); return; }
                setDaysError(null);
                setForecastDays(n);
                onForecast(n);
              }}
              disabled={forecasting || analyzing || (isAuthenticated && credits !== null && credits < 1)}
              variant="outline"
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-medium"
            >
              {forecasting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Forecasting…</>
                : <><BrainCircuit className="h-4 w-4 mr-1.5" />Market Intelligence</>}
            </Button>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 whitespace-nowrap">Forecast days</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draftDays}
                  onChange={(e) => { setDraftDays(e.target.value.replace(/[^0-9]/g, "")); setDaysError(null); }}
                  className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm tabular-nums text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                />
              </div>
              {daysError && <p className="text-xs text-amber-400">{daysError}</p>}
            </div>
            {forecasting && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
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
                {!isAuthenticated && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 flex items-start gap-2">
                    <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] text-amber-300 font-medium leading-snug">Want the full Pro forecast?</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">Full multi-pass intelligence, 6–8 topics, structural drivers & saved reports.</p>
                      <button onClick={() => navigate("/login")} className="mt-1.5 text-[10px] font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2">
                        Sign in for Pro →
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={onCancelForecast}
                  className="relative overflow-hidden rounded-md border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300"
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-rose-500/20 transition-none"
                    style={{ width: `${forecastProgress * 100}%` }}
                  />
                  <span className="relative">Cancel</span>
                </button>
                {forecastPhase && (
                  <p className="text-[11px] text-slate-500 text-center tabular-nums">{forecastPhase}</p>
                )}
              </div>
            )}
            {hasForecast && !forecasting && (
              <Button
                variant="outline"
                onClick={onClearForecast}
                className="border-slate-500/40 text-slate-400 hover:bg-slate-500/10 hover:text-slate-200"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Clear forecast
              </Button>
            )}
            {analyzing && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Model performance link */}
      <div className="flex justify-end">
        <button
          onClick={() => navigate("/forecast-performance")}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors"
        >
          <BarChart2 className="h-3.5 w-3.5" />
          Model performance & calibration →
        </button>
      </div>

      {/* Structural Drivers */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 sm:p-6 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Structural Drivers</h3>
          <p className="text-xs text-slate-500 mt-0.5">Long-term pressures permanently injected into the forecast drift, independent of the news ribbon.</p>
        </div>
        <StructuralDriversPanel asset={asset} />
      </div>
    </div>
  );
}