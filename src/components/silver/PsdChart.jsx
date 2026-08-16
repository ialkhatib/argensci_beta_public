import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { buildPsdSeries, buildPsdInputSeries } from "@/lib/welchPsd";

/**
 * Infer calendar days per sample from the binned chart data.
 * Falls back to 1 (daily) if the data is too sparse to measure.
 */
function inferSamplingDays(binnedPoints) {
  if (!binnedPoints || binnedPoints.length < 2) return 1;
  const gaps = [];
  for (let i = 1; i < Math.min(binnedPoints.length, 20); i++) {
    const g = (new Date(binnedPoints[i].date) - new Date(binnedPoints[i - 1].date)) / 86400000;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return 1;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

/** Format a raw PSD value (price²·days/cycle) for display */
function formatPsd(v) {
  if (v == null || v <= 0) return "—";
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
  return v.toFixed(2);
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f1117]/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-200 mb-1">Period: {d?.period ?? "—"}</p>
      {payload.map(({ name, value, color }) => (
        value != null && (
          <div key={name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-slate-400">{name}:</span>
            <span className="tabular-nums text-slate-200">{formatPsd(value)} (lr)²·d</span>
          </div>
        )
      ))}
    </div>
  );
};

const TimeTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const visible = payload.filter(p => p.value != null);
  if (!visible.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f1117]/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-200 mb-1">Bin {label}</p>
      {visible.map(({ name, value, color }) => (
        <div key={name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-slate-400">{name}:</span>
          <span className="tabular-nums text-slate-200">{value?.toFixed(5)}</span>
        </div>
      ))}
    </div>
  );
};

export default function PsdChart({ binnedPoints, forecastPoints }) {
  const samplingDays = useMemo(() => inferSamplingDays(binnedPoints), [binnedPoints]);

  const series = useMemo(
    () => buildPsdSeries(binnedPoints, forecastPoints, samplingDays),
    [binnedPoints, forecastPoints, samplingDays]
  );

  const inputSeries = useMemo(
    () => buildPsdInputSeries(binnedPoints, forecastPoints, samplingDays),
    [binnedPoints, forecastPoints, samplingDays]
  );

  const hasForecast = forecastPoints?.length > 0 && series.some(d => d.central != null);

  if (!series.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        Not enough data to compute PSD.
      </div>
    );
  }

  // Cap at 2yr and map X to log10(periodDays)
  const capped = series
    .filter(d => d.periodDays <= 730)
    .map(d => ({ ...d, xLog: Math.log10(d.periodDays) }));

  if (!capped.length) return null;

  const minPeriodDays = capped[0].periodDays;
  const maxPeriodDays = capped[capped.length - 1].periodDays;

  // Build intuitive X-axis ticks at round period values (in days)
  const candidateTicks = [
    { days: 1,   label: "1d"  },
    { days: 2,   label: "2d"  },
    { days: 3,   label: "3d"  },
    { days: 5,   label: "5d"  },
    { days: 7,   label: "1w"  },
    { days: 14,  label: "2w"  },
    { days: 21,  label: "3w"  },
    { days: 30,  label: "1mo" },
    { days: 60,  label: "2mo" },
    { days: 90,  label: "3mo" },
    { days: 180, label: "6mo" },
    { days: 365, label: "1yr" },
    { days: 730, label: "2yr" },
  ];
  const xTicks = candidateTicks
    .filter(t => t.days >= minPeriodDays * 0.8 && t.days <= 730 * 1.01)
    .map(t => ({ ...t, x: Math.log10(t.days) }));

  // Faint month reference lines
  const monthLines = Array.from({ length: 24 }, (_, i) => (i + 1) * 30.44)
    .filter(d => d >= minPeriodDays * 0.8 && d <= maxPeriodDays * 1.2)
    .map(d => Math.log10(d));

  const samplingLabel = samplingDays <= 2 ? "daily" : samplingDays <= 8 ? "weekly" : samplingDays <= 35 ? "monthly" : "custom";

  // Y-axis: log10 of raw PSD values
  const allY = capped.flatMap(d => [d.hist, d.central, d.upper95, d.lower95].filter(v => v > 0));
  const minY = allY.length ? Math.floor(Math.log10(Math.min(...allY))) : 0;
  const maxY = allY.length ? Math.ceil(Math.log10(Math.max(...allY))) : 6;

  // Transform data: Y → log10(power)
  const plotData = capped.map(d => ({
    ...d,
    hist:    d.hist    > 0 ? Math.log10(d.hist)    : undefined,
    central: d.central > 0 ? Math.log10(d.central) : undefined,
    upper95: d.upper95 > 0 ? Math.log10(d.upper95) : undefined,
    lower95: d.lower95 > 0 ? Math.log10(d.lower95) : undefined,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Power Spectral Density
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Sampling: {samplingLabel} · {binnedPoints?.length ?? 0} points · period axis: shortest → longest cycles
          </p>
        </div>
        <p className="text-[11px] text-slate-600">Y: log₁₀((log-return)²·d/cycle)</p>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={plotData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="xLog"
            type="number"
            scale="linear"
            domain={[Math.log10(minPeriodDays * 0.9), Math.log10(maxPeriodDays * 1.1)]}
            ticks={xTicks.map(t => t.x)}
            tickFormatter={v => {
              const match = xTicks.find(t => Math.abs(t.x - v) < 0.05);
              return match ? match.label : "";
            }}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
          />
          <YAxis
            type="number"
            domain={[minY, maxY]}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={v => `10^${v.toFixed(0)}`}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          {hasForecast && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => <span className="text-slate-400">{value}</span>}
            />
          )}

          {/* Month reference lines */}
          {monthLines.map(x => (
            <ReferenceLine key={x} x={x} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          ))}

          {/* Historical PSD */}
          <Line
            type="monotone"
            dataKey="hist"
            name="Historical"
            stroke="#94a3b8"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />

          {/* Forecast PSDs */}
          {hasForecast && (
            <>
              <Line
                type="monotone"
                dataKey="central"
                name="Forecast central"
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="upper95"
                name="Forecast upper 95%"
                stroke="#34d399"
                strokeWidth={1}
                strokeDasharray="2 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="lower95"
                name="Forecast lower 95%"
                stroke="#f87171"
                strokeWidth={1}
                strokeDasharray="2 4"
                dot={false}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-slate-600 leading-relaxed">
        Periodogram (Hann window) on log-returns — stationary. Y-axis: log₁₀ of PSD in (log-return)²·days/cycle.
        Forecast series: trimmed history + interpolated GBM projection returns. Upper/lower bands reflect divergent return variance.
      </p>

      {/* Time series used for the PSD */}
      {(() => {
        // Build a unified dataset on a single shared X axis:
        // [0 .. nExcluded-1]  → excluded historical (greyed out)
        // [nExcluded .. N-1]  → active historical (white)
        // [N .. N+nFc-1]      → forecast projections (green/amber/red)
        const nFc = inputSeries.nFc ?? 0;
        const histFull = inputSeries.histSeries ?? [];       // full log-returns
        const nExcluded = hasForecast ? nFc : 0;             // bins dropped for forecast window
        const nActive   = histFull.length - nExcluded;

        // Merge into one array keyed by shared idx
        const unified = histFull.map((p, i) => ({
          idx: i,
          excluded: i < nExcluded ? p.value : undefined,
          hist:     i >= nExcluded ? p.value : undefined,
        }));

        // Append forecast bins — each series (central/upper/lower) aligns with idx starting at nActive
        if (hasForecast) {
          const centralArr = inputSeries.centralSeries ?? [];
          const upperArr   = inputSeries.upperSeries   ?? [];
          const lowerArr   = inputSeries.lowerSeries   ?? [];
          // The forecast series themselves start at idx=0 internally; their last nFc points are forecast.
          // Re-map: forecast portion starts at unified idx = histFull.length
          for (let i = 0; i < nFc; i++) {
            const fcIdx = centralArr.length - nFc + i;
            unified.push({
              idx:     histFull.length + i,
              central: centralArr[fcIdx]?.value,
              upper:   upperArr[fcIdx]?.value,
              lower:   lowerArr[fcIdx]?.value,
            });
          }
        }

        return (
          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Input Time Series
            </p>
            <p className="text-[11px] text-slate-600 mb-2">
              {hasForecast
                ? `${nExcluded} bins excluded from projection PSD (greyed) · ${nActive} active hist bins · ${nFc} forecast bins`
                : `Historical — ${histFull.length} bins`}
            </p>
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mb-2 text-[10px] text-slate-500">
              {hasForecast && <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{background:"rgba(148,163,184,0.3)"}} /> Excluded hist</span>}
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{background:"#e2e8f0"}} /> Historical</span>
              {hasForecast && <>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{background:"#34d399"}} /> Upper 95%</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{background:"#fbbf24"}} /> Central</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{background:"#f87171"}} /> Lower 95%</span>
              </>}
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={unified} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                {hasForecast && (
                  <ReferenceLine x={nExcluded} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
                )}
                {hasForecast && (
                  <ReferenceLine x={histFull.length} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 2" />
                )}
                <XAxis
                  dataKey="idx"
                  type="number"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  label={{ value: "bin index →", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "#475569" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={v => v.toFixed(3)}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip content={<TimeTooltip />} />

                {/* Excluded historical — greyed out */}
                {hasForecast && (
                  <Line type="monotone" dataKey="excluded" name="Excluded hist"
                    stroke="rgba(148,163,184,0.3)" strokeWidth={1} dot={false} legendType="none" />
                )}

                {/* Active historical — bright white */}
                <Line type="monotone" dataKey="hist" name="Historical"
                  stroke="#e2e8f0" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} legendType="none" />

                {/* Forecast projections */}
                {hasForecast && (
                  <>
                    <Line type="monotone" dataKey="upper" name="Upper 95%"
                      stroke="#34d399" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} legendType="none" />
                    <Line type="monotone" dataKey="central" name="Central"
                      stroke="#fbbf24" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} legendType="none" />
                    <Line type="monotone" dataKey="lower" name="Lower 95%"
                      stroke="#f87171" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} legendType="none" />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}
    </div>
  );
}