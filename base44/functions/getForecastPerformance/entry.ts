// getForecastPerformance — Performance metrics API
//
// Returns aggregated scoring metrics and calibration state for the UI dashboard.
// Body params:
//   asset (silver|gold, default: silver)
//   horizon (short|medium|long|all, default: all)
//   limit (number of recent scores, default: 100)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const asset      = body.asset ?? 'silver';
  const horizon    = body.horizon ?? 'all';
  const modelVersion = body.modelVersion ?? 'all';
  const checkpoint = body.checkpoint ?? null; // number or null
  const limit      = Math.min(200, parseInt(body.limit ?? '100', 10));

  try {
    // Fetch recent scores — pro tier only
    const scoreFilter: any = { asset, tier: 'pro' };
    if (horizon !== 'all') scoreFilter.horizonBucket = horizon;
    if (modelVersion !== 'all') scoreFilter.modelVersion = modelVersion;
    if (checkpoint != null) scoreFilter.checkpointDays = checkpoint;

    // Also fetch all available model versions for this asset (for the filter UI)
    const allVersionScores = await base44.asServiceRole.entities.ForecastScore.filter(
      { asset, tier: 'pro' }, '-scoredAt', 500,
    );
    const availableVersions = [...new Set(allVersionScores.map((s: any) => s.modelVersion).filter(Boolean))].sort();

    const rawScores = await base44.asServiceRole.entities.ForecastScore.filter(
      scoreFilter, '-scoredAt', limit,
    );

    // Deduplicate: keep only one score per (forecastRecordId, checkpointDays)
    const seen = new Set<string>();
    const scores = rawScores.filter((s: any) => {
      const key = `${s.forecastRecordId}|${s.checkpointDays}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Fetch current champion calibrations for this asset
    const calibrations = await base44.asServiceRole.entities.ModelCalibration.filter(
      { asset, status: 'champion' }, '-effectiveFrom', 20,
    );

    // Aggregate metrics across all scores in this filter
    const n = scores.length;
    if (n === 0) {
      return Response.json({ asset, horizon, modelVersion, totalScores: 0, calibrations, scores: [], availableVersions: availableVersions });
    }

    const mae  = scores.reduce((s: number, x: any) => s + x.mae, 0) / n;
    const mape = scores.reduce((s: number, x: any) => s + x.mape, 0) / n;
    const dirAcc = scores.filter((x: any) => x.directionallyCorrect).length / n;
    const cov68  = scores.filter((x: any) => x.inInterval68).length / n;
    const cov95  = scores.filter((x: any) => x.inInterval95).length / n;
    const crps   = scores.reduce((s: number, x: any) => s + (x.crps ?? x.mae), 0) / n;

    // Break down by horizon bucket
    const byHorizon: Record<string, any> = {};
    for (const s of scores) {
      const b = s.horizonBucket ?? 'medium';
      if (!byHorizon[b]) byHorizon[b] = { n: 0, mae: 0, dirAcc: 0, cov68: 0, cov95: 0, crps: 0 };
      byHorizon[b].n++;
      byHorizon[b].mae    += s.mae;
      byHorizon[b].dirAcc += s.directionallyCorrect ? 1 : 0;
      byHorizon[b].cov68  += s.inInterval68 ? 1 : 0;
      byHorizon[b].cov95  += s.inInterval95 ? 1 : 0;
      byHorizon[b].crps   += s.crps ?? s.mae;
    }
    for (const b of Object.keys(byHorizon)) {
      const d = byHorizon[b];
      d.mae    = Math.round(d.mae / d.n * 100) / 100;
      d.dirAcc = Math.round(d.dirAcc / d.n * 1000) / 1000;
      d.cov68  = Math.round(d.cov68 / d.n * 1000) / 1000;
      d.cov95  = Math.round(d.cov95 / d.n * 1000) / 1000;
      d.crps   = Math.round(d.crps / d.n * 100) / 100;
    }

    // Break down by regime
    const byRegime: Record<string, any> = {};
    for (const s of scores) {
      const r = s.regime ?? 'ranging';
      if (!byRegime[r]) byRegime[r] = { n: 0, mae: 0, dirAcc: 0, cov95: 0 };
      byRegime[r].n++;
      byRegime[r].mae    += s.mae;
      byRegime[r].dirAcc += s.directionallyCorrect ? 1 : 0;
      byRegime[r].cov95  += s.inInterval95 ? 1 : 0;
    }
    for (const r of Object.keys(byRegime)) {
      const d = byRegime[r];
      d.mae    = Math.round(d.mae / d.n * 100) / 100;
      d.dirAcc = Math.round(d.dirAcc / d.n * 1000) / 1000;
      d.cov95  = Math.round(d.cov95 / d.n * 1000) / 1000;
    }

    // Enrich scores with forecastDays from their parent ForecastRecord (batch fetch)
    const recordIds = [...new Set(scores.map((s: any) => s.forecastRecordId).filter(Boolean))];
    const recordMap: Record<string, any> = {};
    if (recordIds.length > 0) {
      // Fetch in batches of 50
      for (let i = 0; i < recordIds.length; i += 50) {
        const batch = recordIds.slice(i, i + 50);
        const records = await base44.asServiceRole.entities.ForecastRecord.filter(
          { id: { $in: batch } }, 'generatedAt', 50,
        );
        for (const r of records) recordMap[r.id] = r;
      }
    }
    const enrichedScores = scores.map((s: any) => ({
      ...s,
      forecastDays: recordMap[s.forecastRecordId]?.forecastDays ?? null,
    }));

    // Time series for sparklines (last 30 scored, sorted oldest-first)
    const timeSeries = scores.slice(-30).reverse().map((s: any) => ({
      date: s.scoredAt?.slice(0, 10),
      mae: s.mae,
      mape: s.mape,
      directional: s.directionallyCorrect ? 1 : 0,
      inInterval95: s.inInterval95 ? 1 : 0,
      crps: s.crps,
      regime: s.regime,
      horizonBucket: s.horizonBucket,
    }));

    return Response.json({
      asset,
      horizon,
      modelVersion,
      availableVersions,
      totalScores: n,
      aggregate: {
        mae:    Math.round(mae * 100) / 100,
        mape:   Math.round(mape * 100) / 100,
        dirAcc: Math.round(dirAcc * 1000) / 1000,
        cov68:  Math.round(cov68 * 1000) / 1000,
        cov95:  Math.round(cov95 * 1000) / 1000,
        crps:   Math.round(crps * 100) / 100,
      },
      byHorizon,
      byRegime,
      timeSeries,
      calibrations,
      scores: enrichedScores,
    });
  } catch (err: any) {
    console.error('[getForecastPerformance] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}