// Prominence-based peak AND dip detection for financial time series.

export function rebin(points, binSize) {
  if (!points || points.length === 0) return [];
  if (binSize <= 1) {
    return points.map((p) => ({ ...p, binStart: p.date, binEnd: p.date }));
  }
  const bins = [];
  for (let i = 0; i < points.length; i += binSize) {
    const slice = points.slice(i, i + binSize);
    const closes = slice.map((p) => p.close);
    const avg = closes.reduce((s, v) => s + v, 0) / closes.length;
    const highs = slice.map((p) => (p.high ?? p.close));
    const lows = slice.map((p) => (p.low ?? p.close));
    bins.push({
      date: slice[slice.length - 1].date,
      binStart: slice[0].date,
      binEnd: slice[slice.length - 1].date,
      close: Math.round(avg * 100) / 100,
      high: Math.max(...highs),
      low: Math.min(...lows),
      count: slice.length,
    });
  }
  return bins;
}

function findLocalExtrema(values, mode) {
  // mode: "max" for peaks, "min" for dips
  const extrema = [];
  const n = values.length;
  for (let i = 1; i < n - 1; i++) {
    const isPeak = mode === "max"
      ? values[i] > values[i - 1] && values[i] >= values[i + 1]
      : values[i] < values[i - 1] && values[i] <= values[i + 1];
    if (isPeak) {
      let end = i;
      while (end + 1 < n && values[end + 1] === values[i]) end++;
      extrema.push({ index: Math.round((i + end) / 2), value: values[i] });
      i = end;
    }
  }
  return extrema;
}

function computeProminence(values, p, mode) {
  const val = values[p];
  // For peaks: scan left/right until we find a higher value; track the lowest point seen.
  // For dips: scan left/right until we find a lower value; track the highest point seen.
  const exceedsPeak = mode === "max" ? (v) => v > val : (v) => v < val;
  const updateBound = mode === "max"
    ? (bound, v) => Math.min(bound, v)   // track lowest col between two peaks
    : (bound, v) => Math.max(bound, v);  // track highest col between two dips

  let leftBound = val;
  for (let i = p - 1; i >= 0; i--) {
    if (exceedsPeak(values[i])) break;
    leftBound = updateBound(leftBound, values[i]);
  }
  let rightBound = val;
  for (let j = p + 1; j < values.length; j++) {
    if (exceedsPeak(values[j])) break;
    rightBound = updateBound(rightBound, values[j]);
  }
  // Prominence = height above the higher of the two key cols
  const keyCol = mode === "max" ? Math.max(leftBound, rightBound) : Math.min(leftBound, rightBound);
  return Math.abs(val - keyCol);
}

function detectExtrema(series, opts = {}, mode) {
  if (!series || series.length < 3) return [];
  const values = series.map((s) => s.close);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const minProminence = (opts.minProminencePct ?? 0.05) * range;
  const distance = opts.distance ?? 2;

  const candidates = findLocalExtrema(values, mode)
    .map((e) => ({ ...e, prominence: computeProminence(values, e.index, mode) }))
    .filter((e) => e.prominence >= minProminence);

  candidates.sort((a, b) => b.prominence - a.prominence);
  const kept = [];
  for (const c of candidates) {
    if (kept.every((k) => Math.abs(k.index - c.index) >= distance)) {
      kept.push(c);
    }
  }
  kept.sort((a, b) => a.index - b.index);

  return kept.map((e) => {
    const prevClose = e.index > 0 ? values[e.index - 1] : values[e.index];
    const pctChange = ((values[e.index] - prevClose) / prevClose) * 100;
    return {
      ...e,
      ...series[e.index],
      prominencePct: (e.prominence / range) * 100,
      pctChange,
    };
  });
}

export function detectPeaks(series, opts = {}) {
  return detectExtrema(series, opts, "max");
}

export function detectDips(series, opts = {}) {
  return detectExtrema(series, opts, "min");
}