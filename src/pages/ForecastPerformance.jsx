import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, TrendingUp, BarChart2, Target, Activity, Zap, RefreshCw, Loader2, ChevronDown, ChevronUp, Info } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

const HORIZON_LABELS = { short: "Short (≤45d)", medium: "Medium (≤180d)", long: "Long (>180d)" };
const REGIME_COLORS = { trending_up: "#4ade80", trending_down: "#f87171", ranging: "#94a3b8", volatile: "#fbbf24" };
const REGIME_LABELS = { trending_up: "Trending ↑", trending_down: "Trending ↓", ranging: "Ranging", volatile: "Volatile" };

function MetricCard({ label, value, sub, color = "text-slate-200", good, bad }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value ?? "—"}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

function MiniSparkline({ data, dataKey, color = "#fbbf24", referenceLine }) {
  if (!data?.length) return <div className="h-16 flex items-center justify-center text-xs text-slate-600">No data</div>;
  return (
    <ResponsiveContainer width="100%" height={64}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        {referenceLine != null && <ReferenceLine y={referenceLine} stroke="#475569" strokeDasharray="3 3" strokeWidth={1} />}
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function ForecastPerformance() {
  const navigate = useNavigate();
  const [asset, setAsset] = useState("silver");
  const [horizon, setHorizon] = useState("all");
  const [modelVersion, setModelVersion] = useState("all");
  const [checkpoint, setCheckpoint] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCalibration, setShowCalibration] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("getForecastPerformance", { asset, horizon, modelVersion, checkpoint: checkpoint === "all" ? undefined : parseInt(checkpoint), limit: 100 });
      const json = res.data;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [asset, horizon, modelVersion, checkpoint]);

  const agg = data?.aggregate;
  const calList = data?.calibrations ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground px-4 pt-14 pb-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Forecast Performance</h1>
          <p className="text-xs text-slate-500 mt-0.5">Rolling out-of-sample scoring · walk-forward calibration</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto p-2 rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {["silver", "gold"].map(a => (
          <button key={a} onClick={() => setAsset(a)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${asset === a ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
          >{a}</button>
        ))}
        <div className="h-8 w-px bg-white/10 self-center" />
        {["all", "short", "medium", "long"].map(h => (
          <button key={h} onClick={() => setHorizon(h)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${horizon === h ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
          >{h === "all" ? "All horizons" : HORIZON_LABELS[h]}</button>
        ))}
        {(data?.availableVersions?.length > 0) && (
          <>
            <div className="h-8 w-px bg-white/10 self-center" />
            <button onClick={() => setModelVersion("all")}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${modelVersion === "all" ? "border-violet-500/60 bg-violet-500/15 text-violet-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
            >All models</button>
            {data.availableVersions.map(v => (
              <button key={v} onClick={() => setModelVersion(v)}
                className={`rounded-lg border px-4 py-2 text-sm font-mono transition-colors ${modelVersion === v ? "border-violet-500/60 bg-violet-500/15 text-violet-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
              >v{v}</button>
            ))}
          </>
        )}
      </div>

      {/* Checkpoint filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-xs text-slate-500 self-center mr-1">Checkpoint:</span>
        {["all", "1", "3", "7", "14", "30", "60", "90", "180", "365", "730"].map(cp => (
          <button key={cp} onClick={() => setCheckpoint(cp)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${checkpoint === cp ? "border-sky-500/60 bg-sky-500/15 text-sky-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
          >{cp === "all" ? "All" : `+${cp}d`}</button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 mb-4">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      )}

      {data && data.totalScores === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center space-y-2">
          <Activity className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="text-sm font-medium text-slate-400">No scored forecasts yet</p>
          <p className="text-xs text-slate-600 max-w-sm mx-auto">
            Forecasts are automatically scored against realized prices at 1, 3, 7, 14, 30, 60, 90, 180, 365, and 730-day checkpoints. Check back after those intervals have elapsed.
          </p>
        </div>
      )}

      {data && data.totalScores > 0 && (
        <div className="space-y-6">
          {/* Aggregate metrics */}
          <section>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Aggregate · {data.totalScores} scored checkpoint{data.totalScores !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                label="MAE"
                value={`$${agg.mae?.toFixed(2)}`}
                sub="Mean absolute error"
                color={agg.mae < 2 ? "text-emerald-400" : agg.mae < 5 ? "text-amber-300" : "text-rose-400"}
              />
              <MetricCard
                label="MAPE"
                value={`${agg.mape?.toFixed(1)}%`}
                sub="Mean abs % error"
                color={agg.mape < 3 ? "text-emerald-400" : agg.mape < 8 ? "text-amber-300" : "text-rose-400"}
              />
              <MetricCard
                label="Dir. Accuracy"
                value={`${(agg.dirAcc * 100).toFixed(1)}%`}
                sub="Correct direction"
                color={agg.dirAcc > 0.6 ? "text-emerald-400" : agg.dirAcc > 0.5 ? "text-amber-300" : "text-rose-400"}
              />
              <MetricCard
                label="68% Coverage"
                value={`${(agg.cov68 * 100).toFixed(1)}%`}
                sub="Target: 68%"
                color={Math.abs(agg.cov68 - 0.68) < 0.10 ? "text-emerald-400" : "text-amber-300"}
              />
              <MetricCard
                label="95% Coverage"
                value={`${(agg.cov95 * 100).toFixed(1)}%`}
                sub="Target: 95%"
                color={Math.abs(agg.cov95 - 0.95) < 0.10 ? "text-emerald-400" : "text-amber-300"}
              />
              <MetricCard
                label="CRPS"
                value={agg.crps?.toFixed(2)}
                sub="Probabilistic score"
                color={agg.crps < 2 ? "text-emerald-400" : agg.crps < 5 ? "text-amber-300" : "text-rose-400"}
              />
            </div>
          </section>

          {/* Time series sparklines */}
          {data.timeSeries?.length > 2 && (
            <section>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Performance over time (last {data.timeSeries.length} scores)</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5"><BarChart2 className="h-3.5 w-3.5 text-rose-400" /> MAE over time</p>
                  <MiniSparkline data={data.timeSeries} dataKey="mae" color="#f87171" />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-emerald-400" /> Directional accuracy (rolling)</p>
                  <MiniSparkline data={data.timeSeries} dataKey="directional" color="#4ade80" referenceLine={0.5} />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-amber-400" /> 95% interval coverage</p>
                  <MiniSparkline data={data.timeSeries} dataKey="inInterval95" color="#fbbf24" referenceLine={0.95} />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-violet-400" /> CRPS over time</p>
                  <MiniSparkline data={data.timeSeries} dataKey="crps" color="#a78bfa" />
                </div>
              </div>
            </section>
          )}

          {/* By horizon */}
          {Object.keys(data.byHorizon ?? {}).length > 0 && (
            <section>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">By horizon bucket</p>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {["Horizon", "N", "MAE", "Dir. Acc", "95% Cov", "CRPS"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {Object.entries(data.byHorizon).map(([bucket, d]) => (
                      <tr key={bucket}>
                        <td className="px-4 py-2.5 text-slate-300 font-medium">{HORIZON_LABELS[bucket] ?? bucket}</td>
                        <td className="px-4 py-2.5 text-slate-500 tabular-nums">{d.n}</td>
                        <td className="px-4 py-2.5 tabular-nums text-rose-300">${d.mae?.toFixed(2)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-emerald-300">{(d.dirAcc * 100).toFixed(1)}%</td>
                        <td className={`px-4 py-2.5 tabular-nums ${Math.abs(d.cov95 - 0.95) < 0.10 ? "text-emerald-300" : "text-amber-300"}`}>{(d.cov95 * 100).toFixed(1)}%</td>
                        <td className="px-4 py-2.5 tabular-nums text-violet-300">{d.crps?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* By regime */}
          {Object.keys(data.byRegime ?? {}).length > 0 && (
            <section>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">By market regime</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(data.byRegime).map(([regime, d]) => (
                  <div key={regime} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: REGIME_COLORS[regime] ?? "#94a3b8" }} />
                      <span className="text-xs font-medium text-slate-300">{REGIME_LABELS[regime] ?? regime}</span>
                      <span className="ml-auto text-xs text-slate-600">{d.n} scores</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <p className="text-[10px] text-slate-600">MAE</p>
                        <p className="text-sm font-semibold tabular-nums text-rose-300">${d.mae?.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-600">Dir. Acc</p>
                        <p className={`text-sm font-semibold tabular-nums ${d.dirAcc > 0.6 ? "text-emerald-400" : "text-amber-300"}`}>{(d.dirAcc * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-600">95% Coverage</p>
                        <p className={`text-sm font-semibold tabular-nums ${Math.abs(d.cov95 - 0.95) < 0.1 ? "text-emerald-400" : "text-amber-300"}`}>{(d.cov95 * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Individual score entries */}
          <section>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Individual scored entries
            </p>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Generated", "Forecast Days", "Checkpoint", "Spot", "Predicted", "Realized", "MAE", "MAPE", "Dir", "In 95%"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(data.scores ?? []).map((s, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                        {s.forecastDate ? new Date(s.forecastDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-300 whitespace-nowrap">
                        {s.forecastDays != null ? `${s.forecastDays}d` : "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-xs font-medium border border-amber-500/20">
                          +{s.checkpointDays}d
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">${s.spotAtForecast?.toFixed(2)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-300">${s.predictedCentral?.toFixed(2)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-300">${s.realizedPrice?.toFixed(2)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-rose-300">${s.mae?.toFixed(2)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-400">{s.mape?.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-center">{s.directionallyCorrect ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗</span>}</td>
                      <td className="px-4 py-2.5 text-center">{s.inInterval95 ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Calibration state */}
          {calList.length > 0 && (
            <section>
              <button
                onClick={() => setShowCalibration(v => !v)}
                className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3 hover:text-slate-300 transition-colors"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Ensemble calibration ({calList.length} champion{calList.length !== 1 ? "s" : ""})
                {showCalibration ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showCalibration && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        {["Context", "Scores", "Vol Scalar", "Drift Bias", "CRPS", "Dir Acc", "95% Cov", "Champion since"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {calList.map(c => (
                        <tr key={c.id}>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-xs font-medium text-slate-300">{c.horizonBucket}</span>
                            <span className="ml-1.5 text-xs text-slate-600">{c.regime}</span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-500">{c.windowScores}</td>
                          <td className={`px-4 py-2.5 tabular-nums font-medium ${c.volScalar > 1.1 ? "text-amber-300" : c.volScalar < 0.9 ? "text-sky-300" : "text-slate-300"}`}>
                            {c.volScalar?.toFixed(3) ?? "1.000"}
                          </td>
                          <td className={`px-4 py-2.5 tabular-nums font-medium ${Math.abs(c.driftBias ?? 0) > 0.01 ? "text-amber-300" : "text-slate-300"}`}>
                            {c.driftBias != null ? (c.driftBias >= 0 ? "+" : "") + c.driftBias.toFixed(4) : "0.0000"}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-violet-300">{c.rollingCRPS?.toFixed(2) ?? "—"}</td>
                          <td className="px-4 py-2.5 tabular-nums text-emerald-300">{c.rollingDirectionalAcc != null ? (c.rollingDirectionalAcc * 100).toFixed(1) + "%" : "—"}</td>
                          <td className="px-4 py-2.5 tabular-nums text-amber-300">{c.rollingInterval95Coverage != null ? (c.rollingInterval95Coverage * 100).toFixed(1) + "%" : "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{c.championSince ? new Date(c.championSince).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 border-t border-white/5 flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-slate-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <span className="text-slate-400">Vol Scalar</span> widens/tightens the forecast cone to hit calibrated interval coverage.
                      <span className="text-slate-400 ml-1">Drift Bias</span> corrects systematic over/under-prediction.
                      Both are applied automatically to the next forecast run. New calibrations only become champion when they beat the previous CRPS.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}