/**
 * Power Spectral Density estimation in pure JavaScript.
 *
 * periodogramPsd(values) → { frequencies, power }
 *   frequencies[i] = normalised frequency (0–0.5, cycles per sample)
 *   power[i]       = one-sided PSD magnitude (amplitude² · samples)
 *
 * All series passed in must already be sampled at the same uniform bin spacing.
 */

// Hann window
function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

// Radix-2 Cooley-Tukey FFT (real input, in-place on complex arrays)
function fft(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe; im[i + k + len / 2] = uIm - vIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

// Next power of 2 ≥ n
function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Periodogram PSD — single FFT of the full series with a Hann window.
 * Returns raw (unnormalized) one-sided power spectral density.
 * Units: price² · (samples), i.e. price²/frequency_bin_width when divided by N.
 *
 * To get physical units (price²·days/cycle), multiply power[k] by samplingDays/N.
 */
export function periodogramPsd(values) {
  const N = values.length;
  if (N < 4) return { frequencies: [], power: [] };

  const win = hann(N);
  const winPow = win.reduce((s, v) => s + v * v, 0);
  const nfft = nextPow2(N);
  const half = Math.floor(nfft / 2) + 1;

  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < N; i++) re[i] = values[i] * win[i];
  fft(re, im);

  // Scale: 2 / (N * winPow) gives one-sided PSD in units of (price² / freq_bin)
  // where freq_bin = 1/N cycles/sample. Multiply by samplingDays later to get price²·days/cycle.
  const scale = 2.0 / (N * winPow);
  const frequencies = [];
  const power = [];
  for (let k = 0; k < half; k++) {
    let p = (re[k] * re[k] + im[k] * im[k]) * scale;
    if (k === 0 || (nfft % 2 === 0 && k === half - 1)) p /= 2; // DC and Nyquist are not doubled
    frequencies.push(k / nfft);
    power.push(p);
  }

  return { frequencies, power };
}

// Keep old export name as alias for any callers
export const welchPsd = periodogramPsd;

/**
 * Linearly interpolate a sparse forecast series onto a uniform grid with spacing binDays.
 *
 * forecastPoints: array of { date (ISO string or Date), central, upper2, lower2 }
 * lastHistDate:   Date of the last historical bin
 * binDays:        calendar days per bin
 * returns array of { central, upper2, lower2 } at each bin step
 */
function interpolateForecastToBins(forecastPoints, lastHistDate, binDays) {
  if (!forecastPoints?.length) return [];

  // Convert to { t (days from lastHistDate), central, upper2, lower2 }
  const pts = forecastPoints.map(p => ({
    t: (new Date(p.date) - lastHistDate) / 86400000,
    central: p.central,
    upper2: p.upper2,
    lower2: p.lower2,
  })).filter(p => p.t > 0).sort((a, b) => a.t - b.t);

  if (!pts.length) return [];

  const maxT = pts[pts.length - 1].t;
  const nBins = Math.round(maxT / binDays);
  if (nBins < 1) return [];

  const result = [];
  for (let i = 1; i <= nBins; i++) {
    const tTarget = i * binDays;
    // Find surrounding forecast points
    let lo = pts[0], hi = pts[pts.length - 1];
    for (let j = 0; j < pts.length - 1; j++) {
      if (pts[j].t <= tTarget && pts[j + 1].t >= tTarget) {
        lo = pts[j]; hi = pts[j + 1]; break;
      }
    }
    const span = hi.t - lo.t;
    const alpha = span > 0 ? (tTarget - lo.t) / span : 0;
    result.push({
      central: lo.central + alpha * (hi.central - lo.central),
      upper2:  lo.upper2  + alpha * (hi.upper2  - lo.upper2),
      lower2:  lo.lower2  + alpha * (hi.lower2  - lo.lower2),
    });
  }
  return result;
}

/**
 * Convert normalised freq (cycles/sample) → human period label
 */
export function freqToPeriodLabel(normFreq, samplingDays) {
  if (normFreq <= 0) return "∞";
  const periodDays = (1 / normFreq) * samplingDays;
  if (periodDays < 14) return `${Math.round(periodDays)}d`;
  if (periodDays < 60) return `${(periodDays / 7).toFixed(1)}w`;
  if (periodDays < 365 * 1.5) return `${(periodDays / 30.44).toFixed(1)}mo`;
  return `${(periodDays / 365.25).toFixed(1)}yr`;
}

/**
 * Build PSD series ready for Recharts.
 *
 * All three series (hist, forecast central, upper, lower) are computed at the
 * SAME length (N_hist bins) and the SAME bin spacing, so their frequency grids
 * are identical and their PSDs are directly comparable.
 *
 * For the forecast series:
 *   1. Interpolate sparse forecastPoints onto the bin grid.
 *   2. Append those interpolated bins to histValues.
 *   3. Drop the oldest N_forecast bins from the front, so the total length = N_hist.
 *   4. Compute PSD of this "shifted window" series.
 *
 * Returns array of { period, periodDays, hist, central, upper95, lower95 }
 * Y values are in physical units: price² · days / cycle.
 *
 * params:
 *   histPoints     – array of { close, date } (already-binned chart data)
 *   forecastPoints – array of { date, central, upper2, lower2 }
 *   samplingDays   – calendar days per bin (inferred by caller)
 */
/**
 * Build the time series arrays actually fed into the PSD — for display below the chart.
 * Returns { histSeries, centralSeries, upperSeries, lowerSeries }
 * Each series is an array of { idx, value } where idx is the bin index (0-based).
 * Forecast series are the trimmed-history + interpolated-forecast windows.
 */
/** Convert price levels array → log-return array (length N-1).
 *  Returns are winsorized at ±5σ (computed from the non-outlier bulk)
 *  to prevent a single data anomaly from dominating the PSD. */
function toLogReturns(prices) {
  const raw = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) raw.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (raw.length < 4) return raw;

  // Compute median and MAD for robust σ estimate
  const sorted = [...raw].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = [...sorted].map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
  const robustSigma = mad * 1.4826; // MAD → σ scale factor
  const cap = robustSigma > 0 ? Math.max(robustSigma * 5, 0.15) : 0.5;

  return raw.map(v => Math.max(-cap, Math.min(cap, v)));
}

export function buildPsdInputSeries(histPoints, forecastPoints, samplingDays = 1) {
  const histPrices = histPoints.map(p => p.close).filter(v => v > 0);
  if (histPrices.length < 4) return { histSeries: [], centralSeries: [], upperSeries: [], lowerSeries: [] };

  const histReturns = toLogReturns(histPrices);
  const histSeries = histReturns.map((v, i) => ({ idx: i, value: v }));

  if (!forecastPoints?.length || !histPoints.length) {
    return { histSeries, centralSeries: [], upperSeries: [], lowerSeries: [] };
  }

  const lastHistDate = new Date(histPoints[histPoints.length - 1].date);
  const fcBins = interpolateForecastToBins(forecastPoints, lastHistDate, samplingDays);

  if (!fcBins.length) return { histSeries, centralSeries: [], upperSeries: [], lowerSeries: [] };

  const nFc = fcBins.length;
  const histTrimmed = histPrices.slice(nFc);

  const makeReturnSeries = (prices) => toLogReturns(prices).map((v, i) => ({ idx: i, value: v }));

  return {
    histSeries,
    centralSeries: makeReturnSeries([...histTrimmed, ...fcBins.map(p => p.central)]),
    upperSeries:   makeReturnSeries([...histTrimmed, ...fcBins.map(p => p.upper2)]),
    lowerSeries:   makeReturnSeries([...histTrimmed, ...fcBins.map(p => p.lower2)]),
    nHistTrimmed: histTrimmed.length,
    nFc,
  };
}

export function buildPsdSeries(histPoints, forecastPoints, samplingDays = 1) {
  const histPrices = histPoints.map(p => p.close).filter(v => v > 0);
  if (histPrices.length < 5) return []; // need ≥5 prices to get ≥4 returns

  const histValues = toLogReturns(histPrices); // stationary log-returns
  const N = histValues.length;
  if (N < 4) return [];

  // Physical scale factor: (log-return)²·days/cycle
  const physScale = samplingDays;

  // Historical PSD
  const { frequencies: hFreq, power: hPow } = periodogramPsd(histValues);

  // Forecast series
  let cPow = [], uPow = [], lPow = [];

  if (forecastPoints?.length > 0 && histPoints.length > 0) {
    const lastHistDate = new Date(histPoints[histPoints.length - 1].date);
    const fcBins = interpolateForecastToBins(forecastPoints, lastHistDate, samplingDays);

    if (fcBins.length > 0) {
      const nFc = fcBins.length;
      // Drop oldest nFc price bins from history so total prices = N+1 → returns length = N
      const histTrimmed = histPrices.slice(nFc);

      const centralReturns = toLogReturns([...histTrimmed, ...fcBins.map(p => p.central)]);
      const upperReturns   = toLogReturns([...histTrimmed, ...fcBins.map(p => p.upper2)]);
      const lowerReturns   = toLogReturns([...histTrimmed, ...fcBins.map(p => p.lower2)]);

      ({ power: cPow } = periodogramPsd(centralReturns));
      ({ power: uPow } = periodogramPsd(upperReturns));
      ({ power: lPow } = periodogramPsd(lowerReturns));
    }
  }

  // Build output on the historical frequency grid
  const result = [];
  for (let k = 1; k < hFreq.length; k++) { // skip DC (k=0)
    const freq = hFreq[k];
    if (freq <= 0) continue;
    const periodDays = (1 / freq) * samplingDays;
    if (periodDays < samplingDays * 1.5) continue; // skip sub-sample periods

    const entry = {
      periodDays,
      period: freqToPeriodLabel(freq, samplingDays),
      hist: hPow[k] * physScale,
    };

    if (cPow.length > k) entry.central  = cPow[k] * physScale;
    if (uPow.length > k) entry.upper95  = uPow[k] * physScale;
    if (lPow.length > k) entry.lower95  = lPow[k] * physScale;

    result.push(entry);
  }

  result.sort((a, b) => a.periodDays - b.periodDays);
  return result;
}