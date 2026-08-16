import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import LiveNewsDot from "@/components/silver/LiveNewsDot";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceArea,
  Line,
} from "recharts";

const tooltipStyle = {
  background: "rgba(15,18,23,0.55)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "13px",
  boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

// Custom tooltip that shows rich forecast explanation when hovering forecast zone
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const d = payload[0]?.payload ?? {};
  const isForecast = d.central != null && d.close == null;
  const dateStr = new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (!isForecast) {
    const price = d.close;
    if (price == null) return null;
    return (
      <div style={tooltipStyle} className="px-3 py-2">
        <div style={{ color: "#94a3b8", fontSize: "11px", marginBottom: "3px" }}>{dateStr}</div>
        <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "15px" }}>${Number(price).toFixed(2)}<span style={{ color: "#64748b", fontWeight: 400, fontSize: "11px", marginLeft: "3px" }}>/oz</span></div>
      </div>
    );
  }

  const { central, upper1, lower1, upper2, lower2 } = d;
  const upside = ((upper2 - central) / central * 100).toFixed(1);
  const downside = ((central - lower2) / central * 100).toFixed(1);
  // Need spot price — find most recent historical close from payload
  const spot = payload.find(p => p.payload?.close != null)?.payload?.close
    ?? payload[0]?.payload?.central;
  const medianPct = spot ? ((central - spot) / spot * 100).toFixed(1) : null;

  return (
    <div style={{ ...tooltipStyle, maxWidth: 260 }} className="px-3 py-3 space-y-2.5">
      <div className="text-amber-400 text-xs font-semibold">{dateStr}</div>

      {/* Prices */}
      <div className="space-y-1">
        <div className="flex justify-between gap-3 items-center">
          <span className="text-amber-300 text-xs">Median</span>
          <span className="text-amber-200 font-semibold tabular-nums text-sm flex items-center gap-1.5">
            ${Number(central).toFixed(2)}
            {medianPct != null && (
              <span className={`text-xs font-medium ${Number(medianPct) >= 0 ? "text-amber-400/70" : "text-amber-600/70"}`}>
                {Number(medianPct) >= 0 ? "+" : ""}{medianPct}%
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-emerald-400/70 text-xs">Upper (~95%)</span>
          <span className="text-emerald-300 tabular-nums text-xs font-medium">${Number(upper2).toFixed(2)} <span className="text-emerald-500/60">+{upside}%</span></span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-rose-400/70 text-xs">Lower (~95%)</span>
          <span className="text-rose-300 tabular-nums text-xs font-medium">${Number(lower2).toFixed(2)} <span className="text-rose-500/60">-{downside}%</span></span>
        </div>
      </div>

      {/* Reasoning */}
      <div className="border-t border-white/10 pt-2 space-y-1.5 text-xs">
        <div>
          <span className="text-emerald-400 font-medium">↑ Upper drivers: </span>
          <span className="text-slate-400">Fed cuts, dollar weakness, geopolitical risk, ETF inflows, supply shock</span>
        </div>
        <div>
          <span className="text-rose-400 font-medium">↓ Lower drivers: </span>
          <span className="text-slate-400">Rate hikes, DXY strength, industrial slowdown, ETF outflows, margin calls</span>
        </div>
        <div className="text-slate-600 pt-0.5">Cone widens with time — fat-tail adjusted (t₄)</div>
      </div>
    </div>
  );
}

function EventDot({ cx, cy, type, onClick, dataIndex }) {
  const color = type === "peak" ? "#4ade80" : "#f87171";
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onClick(dataIndex, type)}>
      <rect x={cx - 22} y={cy - 22} width={44} height={44} fill="transparent" />
      <circle cx={cx} cy={cy} r={7} fill={color} stroke="#0b0d10" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={12} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.5} />
    </g>
  );
}

export default function SilverChart({ data, peaks, dips, onDotClick, onZoom, onReset, isZoomed, forecastPoints, asset, isAuthenticated, hasForecast, isLiteForecast, onRerun }) {
  const navigate = useNavigate();
  const [selecting, setSelecting] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [zoomEnabled, setZoomEnabled] = useState(false);

  const containerRef = useRef(null);
  const pinchStartDistRef = useRef(null);
  const pinchStartDatesRef = useRef(null);
  const pendingPinchRef = useRef(null);

  // Merge historical + forecast into one dataset for the chart
  const mergedData = useMemo(() => {
    if (!forecastPoints?.length || !data.length) return data;
    const lastHistorical = data[data.length - 1];
    // Bridge point: first forecast point gets the last close as its historical close
    const bridge = [{ ...lastHistorical, central: lastHistorical.close, upper1: lastHistorical.close, upper2: lastHistorical.close, lower1: lastHistorical.close, lower2: lastHistorical.close }];
    const fPoints = forecastPoints.map((fp) => ({ date: fp.date, central: fp.central, upper1: fp.upper1, upper2: fp.upper2, lower1: fp.lower1, lower2: fp.lower2 }));
    return [...data.slice(0, -1), ...bridge, ...fPoints];
  }, [data, forecastPoints]);

  const dates = useMemo(() => mergedData.map((d) => d.date), [mergedData]);

  const getPinchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (!zoomEnabled) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartDistRef.current = getPinchDistance(e.touches);
        // Record current visible range indices
        const fromDate = data[0]?.date;
        const toDate = data[data.length - 1]?.date;
        const allDates = dates;
        pinchStartDatesRef.current = {
          fromIndex: allDates.indexOf(fromDate),
          toIndex: allDates.indexOf(toDate),
        };
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
        e.preventDefault();
        const currentDist = getPinchDistance(e.touches);
        const scale = currentDist / pinchStartDistRef.current;
        const { fromIndex, toIndex } = pinchStartDatesRef.current;
        const totalPoints = toIndex - fromIndex;

        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const rect = el.getBoundingClientRect();
        const centerRatio = Math.max(0, Math.min(1, (centerX - rect.left) / rect.width));

        const newWindow = Math.round(totalPoints / scale);
        const clamped = Math.max(5, Math.min(dates.length - 1, newWindow));
        const centerIndex = Math.round(fromIndex + totalPoints * centerRatio);
        const half = Math.round(clamped / 2);
        const newFrom = Math.max(0, centerIndex - half);
        const newTo = Math.min(dates.length - 1, newFrom + clamped);

        // Update tracking state but defer the onZoom call until touchend
        pinchStartDatesRef.current = { fromIndex: newFrom, toIndex: newTo };
        pinchStartDistRef.current = currentDist;
        pendingPinchRef.current = { from: dates[newFrom], to: dates[newTo] };
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) {
        // Fire onZoom only once when the pinch gesture ends
        if (pendingPinchRef.current && onZoom) {
          onZoom(pendingPinchRef.current.from, pendingPinchRef.current.to);
          pendingPinchRef.current = null;
        }
        pinchStartDistRef.current = null;
        pinchStartDatesRef.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [dates, data, onZoom, zoomEnabled]);



  // Mouse drag-to-zoom
  const handleMouseDown = useCallback((e) => {
    if (!zoomEnabled || !e?.activeLabel) return;
    setStartDate(e.activeLabel);
    setEndDate(null);
    setSelecting(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!zoomEnabled || !selecting || !e?.activeLabel) return;
    setEndDate(e.activeLabel);
  }, [selecting]);

  const handleMouseUp = useCallback(() => {
    if (!selecting) return;
    setSelecting(false);
    if (startDate && endDate && startDate !== endDate && onZoom) {
      const [from, to] = startDate < endDate ? [startDate, endDate] : [endDate, startDate];
      onZoom(from, to);
    }
    setStartDate(null);
    setEndDate(null);
  }, [selecting, startDate, endDate, onZoom]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" /> Peak
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Dip
          </span>
          {forecastPoints?.length > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" /> Forecast
              </span>
              <span className="flex items-center gap-1.5 text-amber-400/60">
                <span className="inline-block w-4 border-t border-dashed border-amber-400/60" /> Uncertainty cone (fat-tail adj.)
              </span>
            </>
          )}
          <button
            onClick={() => setZoomEnabled((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 rounded-lg border transition-colors min-h-[44px] sm:min-h-0 sm:py-1 ${
              zoomEnabled
                ? "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                : "border-slate-600/40 bg-slate-700/30 text-slate-500 hover:bg-slate-700/40"
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full transition-colors ${zoomEnabled ? "bg-amber-400" : "bg-slate-600"}`} />
            {zoomEnabled ? "Zoom on" : "Zoom off"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isZoomed && onReset && (
            <button
              onClick={onReset}
              className="text-xs px-3 py-1 rounded-lg border border-white/10 bg-white/[0.05] text-slate-400 hover:text-slate-200 hover:bg-white/[0.1] transition-colors"
            >
              ↺ Reset zoom
            </button>
          )}
          {hasForecast && (
            isAuthenticated ? (
              <div className="flex flex-col items-end gap-0.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                  <Zap className="h-3 w-3" /> {isLiteForecast ? "Lite" : "Pro"}
                </span>
                {isLiteForecast && onRerun && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRerun(); }}
                    className="text-[9px] text-amber-400/70 hover:text-amber-400 underline underline-offset-2 transition-colors"
                  >
                    Re-run for full Pro analysis →
                  </button>
                )}
              </div>
            ) : !isLiteForecast ? (
              // Pro analysis loaded but signed out — show Pro pill
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                <Zap className="h-3 w-3" /> Pro
              </span>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/40 bg-slate-700/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
              >
                Lite · Sign in for Pro →
              </button>
            )
          )}
        </div>
      </div>
      <div ref={containerRef}>
        <ResponsiveContainer width="100%" height={420}>
          <ComposedChart
            data={mergedData}
            margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ cursor: !zoomEnabled ? "default" : selecting ? "crosshair" : "default" }}
          >
            <defs>
              <linearGradient id="silverFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cone2Fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="cone1Fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              minTickGap={50}
              tickFormatter={(d) =>
                new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
              }
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              width={52}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              fill="url(#silverFill)"
              dot={false}
              activeDot={{ r: 4, fill: "hsl(var(--foreground))" }}
            />
            {/* Forecast cone: 2σ band (outer) */}
            {forecastPoints?.length > 0 && (
              <Area
                type="monotone"
                dataKey="upper2"
                stroke="none"
                fill="url(#cone2Fill)"
                dot={false}
                activeDot={false}
                legendType="none"
              />
            )}
            {forecastPoints?.length > 0 && (
              <Area
                type="monotone"
                dataKey="lower2"
                stroke="none"
                fill="url(#cone2Fill)"
                dot={false}
                activeDot={false}
                legendType="none"
              />
            )}
            {/* Forecast cone: 1σ band (inner) */}
            {forecastPoints?.length > 0 && (
              <Area
                type="monotone"
                dataKey="upper1"
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="4 3"
                fill="url(#cone1Fill)"
                dot={false}
                activeDot={false}
                legendType="none"
              />
            )}
            {forecastPoints?.length > 0 && (
              <Area
                type="monotone"
                dataKey="lower1"
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="4 3"
                fill="url(#cone1Fill)"
                dot={false}
                activeDot={false}
                legendType="none"
              />
            )}
            {/* Forecast central line */}
            {forecastPoints?.length > 0 && (
              <Line
                type="monotone"
                dataKey="central"
                stroke="#fbbf24"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                activeDot={{ r: 3, fill: "#fbbf24" }}
                legendType="none"
              />
            )}
            {peaks.map((p) => (
              <ReferenceDot
                key={`peak-${p.date}`}
                x={p.date}
                y={p.close}
                shape={(props) => (
                  <EventDot cx={props.cx} cy={props.cy} type="peak" dataIndex={p.index} onClick={onDotClick} />
                )}
              />
            ))}
            {dips.map((d) => (
              <ReferenceDot
                key={`dip-${d.date}`}
                x={d.date}
                y={d.close}
                shape={(props) => (
                  <EventDot cx={props.cx} cy={props.cy} type="dip" dataIndex={d.index} onClick={onDotClick} />
                )}
              />
            ))}
            {/* Live news dot on the latest historical price point */}
            {data.length > 0 && (() => {
              const last = data[data.length - 1];
              return (
                <ReferenceDot
                  key="live-dot"
                  x={last.date}
                  y={last.close}
                  shape={(props) => (
                    <LiveNewsDot cx={props.cx} cy={props.cy} price={last.close} asset={asset} />
                  )}
                />
              );
            })()}
            {selecting && startDate && endDate && (
              <ReferenceArea
                x1={startDate}
                x2={endDate}
                strokeOpacity={0.4}
                stroke="#94a3b8"
                fill="#94a3b8"
                fillOpacity={0.12}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}