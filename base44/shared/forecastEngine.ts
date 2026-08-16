// ── Forecast Engine Shared Utilities ─────────────────────────────────────────
// Regime detection, CRPS computation, calibration lookup, and record-saving.
// Imported by marketIntelligenceCore, scoreForecastsJob, and getForecastPerformance.
//
// ── MODEL VERSION CHANGELOG ───────────────────────────────────────────────────
// Bump MODEL_VERSION whenever the intelligence pipeline changes meaningfully:
//   - Patch (x.x.N): minor prompt tweaks, copy changes, bug fixes
//   - Minor (x.N.0): new scoring metric, new topic category, new LLM model
//   - Major (N.0.0): new forecasting algorithm, structural change to outputs
//
// v1.0.0 — initial release: GBM cone + Gemini discovery + Claude synthesis
// ─────────────────────────────────────────────────────────────────────────────
export const MODEL_VERSION = '1.0.0';

// ── Horizon bucket ────────────────────────────────────────────────────────────
export function horizonBucket(days: number): 'short' | 'medium' | 'long' {
  if (days <= 45) return 'short';
  if (days <= 180) return 'medium';
  return 'long';
}

// ── Regime detection ──────────────────────────────────────────────────────────
// Uses the last 60 data points (or all available) to classify the current regime.
export function detectRegime(closes: number[]): 'trending_up' | 'trending_down' | 'ranging' | 'volatile' {
  const window = closes.slice(-60);
  if (window.length < 10) return 'ranging';
  const n = window.length;
  const logReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    if (window[i - 1] > 0 && window[i] > 0) logReturns.push(Math.log(window[i] / window[i - 1]));
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  const annualVol = Math.sqrt(variance) * Math.sqrt(252);

  // High volatility regime: annualised vol > 40%
  if (annualVol > 0.40) return 'volatile';

  // Trend detection: compare first-third mean vs last-third mean
  const third = Math.floor(n / 3);
  const firstMean = window.slice(0, third).reduce((a, b) => a + b, 0) / third;
  const lastMean = window.slice(-third).reduce((a, b) => a + b, 0) / third;
  const drift = (lastMean - firstMean) / firstMean;
  if (drift > 0.05) return 'trending_up';
  if (drift < -0.05) return 'trending_down';
  return 'ranging';
}

// ── CRPS (Continuous Ranked Probability Score) ────────────────────────────────
// Approximated as the energy score for a 5-point ensemble (central, ±1σ, ±2σ).
// Lower = better. Equal to MAE for a point forecast.
export function computeCRPS(
  realized: number,
  central: number,
  lower1: number,
  upper1: number,
  lower2: number,
  upper2: number,
): number {
  // 5-member ensemble with rough probability masses
  const members = [lower2, lower1, central, upper1, upper2];
  const weights = [0.10, 0.25, 0.30, 0.25, 0.10];
  // CRPS ≈ E[|X - y|] - 0.5 * E[|X - X'|]
  let ey = 0;
  let exx = 0;
  for (let i = 0; i < members.length; i++) {
    ey += weights[i] * Math.abs(members[i] - realized);
    for (let j = 0; j < members.length; j++) {
      exx += weights[i] * weights[j] * Math.abs(members[i] - members[j]);
    }
  }
  return Math.round((ey - 0.5 * exx) * 100) / 100;
}

// ── Fetch champion calibration for a given context ────────────────────────────
export async function getCalibration(
  base44: any,
  asset: string,
  horizon: string,
  regime: string,
  modelVersion: string,
): Promise<{ driftBias: number; volScalar: number } | null> {
  try {
    // Try exact match first (asset + horizon + regime + modelVersion)
    const exact = await base44.asServiceRole.entities.ModelCalibration.filter({
      asset,
      horizonBucket: horizon,
      regime,
      modelVersion,
      status: 'champion',
    }, '-effectiveFrom', 1);
    if (exact?.length) return { driftBias: exact[0].driftBias ?? 0, volScalar: exact[0].volScalar ?? 1.0 };

    // Fall back to regime='all' for the same asset + horizon + modelVersion
    const fallback = await base44.asServiceRole.entities.ModelCalibration.filter({
      asset,
      horizonBucket: horizon,
      regime: 'all',
      modelVersion,
      status: 'champion',
    }, '-effectiveFrom', 1);
    if (fallback?.length) return { driftBias: fallback[0].driftBias ?? 0, volScalar: fallback[0].volScalar ?? 1.0 };
  } catch (_e) {}
  return null;
}

// ── Save a forecast record (called from intelligence pipeline) ─────────────────
export async function saveForecastRecord(
  base44: any,
  params: {
    asset: string;
    tier: 'pro' | 'lite';
    forecastDays: number;
    spotAtForecast: number;
    generatedAt: string;
    inputs: object;
    forecastPoints: object[];
    closes: number[];
    overallBias: string;
    userId?: string | null;
  },
): Promise<string | null> {
  try {
    const regime = detectRegime(params.closes);
    const bucket = horizonBucket(params.forecastDays);
    const record = await base44.asServiceRole.entities.ForecastRecord.create({
      asset: params.asset,
      tier: params.tier,
      forecastDays: params.forecastDays,
      spotAtForecast: params.spotAtForecast,
      generatedAt: params.generatedAt,
      modelVersion: MODEL_VERSION,
      inputs: JSON.stringify(params.inputs),
      forecastPoints: JSON.stringify(params.forecastPoints),
      regime,
      horizonBucket: bucket,
      overallBias: params.overallBias || 'neutral',
      userId: params.userId ?? null,
      scored1: false,
      scored3: false,
      scored7: false,
      scored14: false,
      scored30: false,
      scored60: false,
      scored90: false,
      scored180: false,
      scored365: false,
      scored730: false,
    });
    console.log(`[forecastEngine] Saved ForecastRecord ${record.id} (${params.asset} ${bucket} ${regime})`);
    return record.id;
  } catch (err: any) {
    console.error('[forecastEngine] saveForecastRecord error:', err.message);
    return null;
  }
}

// ── Rolling calibration update ────────────────────────────────────────────────
// Called after scoring to recompute champion calibration weights for a context.
export async function updateCalibration(
  base44: any,
  asset: string,
  horizon: string,
  regime: string,
  modelVersion: string,
): Promise<void> {
  try {
    // Fetch the most recent 30 scores for this context + model version
    const scoreFilter: any = { asset, horizonBucket: horizon, modelVersion };
    if (regime !== 'all') scoreFilter.regime = regime;
    const scores = await base44.asServiceRole.entities.ForecastScore.filter(
      scoreFilter,
      '-scoredAt',
      30,
    );
    if (scores.length < 3) {
      console.log(`[forecastEngine] Not enough scores to calibrate (${scores.length}) for ${asset}/${horizon}/${regime}`);
      return;
    }

    // Exponential weights — most recent score gets highest weight
    const lambda = 0.94; // decay factor
    const rawWeights = scores.map((_, i) => Math.pow(lambda, i));
    const totalW = rawWeights.reduce((a, b) => a + b, 0);
    const w = rawWeights.map(x => x / totalW);

    let mae = 0, mape = 0, dirAcc = 0, cov68 = 0, cov95 = 0, crpsSum = 0;
    let driftBiasSum = 0;

    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      mae          += w[i] * s.mae;
      mape         += w[i] * s.mape;
      dirAcc       += w[i] * (s.directionallyCorrect ? 1 : 0);
      cov68        += w[i] * (s.inInterval68 ? 1 : 0);
      cov95        += w[i] * (s.inInterval95 ? 1 : 0);
      crpsSum      += w[i] * (s.crps ?? s.mae);
      // Systematic bias: positive means model over-predicted (central > realized)
      driftBiasSum += w[i] * ((s.predictedCentral - s.realizedPrice) / s.spotAtForecast);
    }

    // Interval coverage correction: if 95% CI only covers 70% of outcomes,
    // scale vol up by sqrt(0.95/0.70) to widen the cone.
    const targetCov95 = 0.95;
    const volScalar = cov95 < 0.10
      ? 1.0  // not enough data to trust
      : Math.min(2.0, Math.max(0.5, Math.sqrt(targetCov95 / Math.max(0.1, cov95))));

    // Drift bias correction: negative driftBias means we systematically over-predicted
    const driftBias = -driftBiasSum; // correction to subtract from future drift

    // Fetch current champion to run champion-challenger comparison
    const existing = await base44.asServiceRole.entities.ModelCalibration.filter(
      { asset, horizonBucket: horizon, regime, modelVersion, status: 'champion' },
      '-effectiveFrom', 1,
    );

    const newIsImprovement = existing.length === 0 || crpsSum < (existing[0].rollingCRPS ?? Infinity);

    if (existing.length > 0 && !newIsImprovement) {
      // Challenger loses this window — reset win streak if one exists
      console.log(`[forecastEngine] New calibration is not better than champion for ${asset}/${horizon}/${regime} — keeping champion`);
      return;
    }

    // New calibration wins — create new champion record
    await base44.asServiceRole.entities.ModelCalibration.create({
      asset,
      horizonBucket: horizon,
      regime,
      modelVersion,
      effectiveFrom: new Date().toISOString(),
      windowScores: scores.length,
      rollingMAE: Math.round(mae * 100) / 100,
      rollingMAPE: Math.round(mape * 100) / 100,
      rollingDirectionalAcc: Math.round(dirAcc * 1000) / 1000,
      rollingInterval68Coverage: Math.round(cov68 * 1000) / 1000,
      rollingInterval95Coverage: Math.round(cov95 * 1000) / 1000,
      rollingCRPS: Math.round(crpsSum * 100) / 100,
      driftBias: Math.round(driftBias * 10000) / 10000,
      volScalar: Math.round(volScalar * 1000) / 1000,
      status: 'champion',
      championSince: new Date().toISOString(),
      consecutiveWins: (existing[0]?.consecutiveWins ?? 0) + 1,
    });

    // Retire previous champion (if any) — never delete, just mark retired
    if (existing.length > 0) {
      await base44.asServiceRole.entities.ModelCalibration.update(existing[0].id, { status: 'retired' });
    }

    console.log(`[forecastEngine] Updated champion calibration for ${asset}/${horizon}/${regime}: CRPS=${crpsSum.toFixed(3)}, volScalar=${volScalar.toFixed(3)}, driftBias=${driftBias.toFixed(4)}`);
  } catch (err: any) {
    console.error('[forecastEngine] updateCalibration error:', err.message);
  }
}