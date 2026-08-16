// scoreForecastsJob — Periodic scoring engine
//
// Called by a scheduled workflow. For every ForecastRecord with pending
// checkpoint flags (scored30 / scored90 / scored180 = false), this function:
//   1. Checks whether the checkpoint date has passed
//   2. Fetches the realized silver/gold price at that date from the price API
//   3. Computes MAE, MAPE, directional accuracy, interval coverage, CRPS
//   4. Saves a ForecastScore record (immutable — never updates old ones)
//   5. Marks the checkpoint flag on the ForecastRecord
//   6. Triggers calibration update for that asset / horizon / regime context
//
// Can also be called manually via POST with { dry_run: true } to preview without writing.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeCRPS, updateCalibration } from '../../shared/forecastEngine.ts';

const CHECKPOINT_DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730];

// Fetch daily closes from the existing fetchSilverPrices function
async function fetchPriceAt(base44: any, asset: string, targetDate: string): Promise<number | null> {
  try {
    const url = asset === 'gold'
      ? `https://data-asg.goldprice.org/dbXRates/USD`
      : null;

    // Use the Alpha Vantage / Yahoo Finance proxy already wired in fetchSilverPrices
    // We replicate a minimal call here: fetch ~5 days around target and pick the closest
    const from = new Date(new Date(targetDate).getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const to   = new Date(new Date(targetDate).getTime() + 7 * 86400000).toISOString().slice(0, 10);

    const symbol = asset === 'gold' ? 'GC=F' : 'SI=F';
    // Yahoo Finance v8 — same endpoint used by fetchSilverPrices
    const period1 = Math.floor(new Date(from).getTime() / 1000);
    const period2 = Math.floor(new Date(to).getTime() / 1000);
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${period1}&period2=${period2}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const timestamps: number[] = json?.chart?.result?.[0]?.timestamp ?? [];
    const closes: number[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];

    if (!timestamps.length || !closes.length) return null;

    // Find the closest trading day to targetDate
    const targetMs = new Date(targetDate).getTime();
    let best: number | null = null;
    let bestDiff = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      const diff = Math.abs(timestamps[i] * 1000 - targetMs);
      if (diff < bestDiff) { bestDiff = diff; best = closes[i]; }
    }
    return best;
  } catch (err: any) {
    console.error(`[scoreForecastsJob] fetchPriceAt error for ${asset} ${targetDate}:`, err.message);
    return null;
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;

  console.log(`[scoreForecastsJob] Starting${dryRun ? ' (DRY RUN)' : ''}…`);

  const now = Date.now();
  const summary = { processed: 0, scored: 0, skipped: 0, errors: 0 };

  try {
    // Fetch records that still have at least one unscored checkpoint
    // Process up to 50 at a time to stay within function timeout
    const pendingRecords = await base44.asServiceRole.entities.ForecastRecord.filter(
      { $or: [{ scored1: { $ne: true } }, { scored3: { $ne: true } }, { scored7: { $ne: true } }, { scored14: { $ne: true } }, { scored30: { $ne: true } }, { scored60: { $ne: true } }, { scored90: { $ne: true } }, { scored180: { $ne: true } }, { scored365: { $ne: true } }, { scored730: { $ne: true } }] },
      'generatedAt',
      50,
    );

    console.log(`[scoreForecastsJob] Found ${pendingRecords.length} records with pending checkpoints`);

    // Track which calibration contexts need updating after this batch
    const calibrationContexts = new Set<string>();

    for (const record of pendingRecords) {
      summary.processed++;
      try {
        const forecastMs = new Date(record.generatedAt).getTime();
        let forecastPoints: any[] = [];
        try { forecastPoints = JSON.parse(record.forecastPoints || '[]'); } catch {}

        for (const cpDays of CHECKPOINT_DAYS) {
          const flagKey = `scored${cpDays}` as 'scored1' | 'scored3' | 'scored7' | 'scored14' | 'scored30' | 'scored60' | 'scored90' | 'scored180' | 'scored365' | 'scored730';
          if (record[flagKey]) continue; // already scored

          const checkpointMs = forecastMs + cpDays * 86400000;
          if (now < checkpointMs) continue; // not yet due

          const checkpointDate = new Date(checkpointMs).toISOString().slice(0, 10);

          // Find the forecast point closest to checkpoint date
          let closestPoint: any = null;
          let closestDiff = Infinity;
          for (const fp of forecastPoints) {
            const d = Math.abs(new Date(fp.date).getTime() - checkpointMs);
            if (d < closestDiff) { closestDiff = d; closestPoint = fp; }
          }

          if (!closestPoint) {
            console.warn(`[scoreForecastsJob] No forecast point near checkpoint ${checkpointDate} for record ${record.id}`);
            if (!dryRun) {
              await base44.asServiceRole.entities.ForecastRecord.update(record.id, { [flagKey]: true });
            }
            continue;
          }

          const realizedPrice = await fetchPriceAt(base44, record.asset, checkpointDate);
          if (realizedPrice == null) {
            console.warn(`[scoreForecastsJob] Could not fetch realized price for ${record.asset} on ${checkpointDate}`);
            summary.skipped++;
            continue;
          }

          const spot = record.spotAtForecast;
          const predicted = closestPoint.central;

          // Core metrics
          const mae  = Math.round(Math.abs(realizedPrice - predicted) * 100) / 100;
          const mape = Math.round((Math.abs(realizedPrice - predicted) / spot) * 10000) / 100;
          const directionallyCorrect = (predicted > spot) === (realizedPrice > spot);
          const inInterval68 = realizedPrice >= closestPoint.lower1 && realizedPrice <= closestPoint.upper1;
          const inInterval95 = realizedPrice >= closestPoint.lower2 && realizedPrice <= closestPoint.upper2;
          const crps = computeCRPS(
            realizedPrice,
            closestPoint.central,
            closestPoint.lower1,
            closestPoint.upper1,
            closestPoint.lower2,
            closestPoint.upper2,
          );

          console.log(`[scoreForecastsJob] Score ${record.asset} record=${record.id} cp=${cpDays}d: realized=${realizedPrice.toFixed(2)} predicted=${predicted.toFixed(2)} MAE=${mae} MAPE=${mape}% dir=${directionallyCorrect} in68=${inInterval68} in95=${inInterval95} CRPS=${crps}`);

          if (!dryRun) {
            // Save immutable score record
            await base44.asServiceRole.entities.ForecastScore.create({
              forecastRecordId: record.id,
              asset: record.asset,
              tier: record.tier,
              horizonBucket: record.horizonBucket,
              regime: record.regime ?? 'ranging',
              checkpointDays: cpDays,
              forecastDate: record.generatedAt,
              scoredAt: new Date().toISOString(),
              spotAtForecast: spot,
              realizedPrice,
              predictedCentral: predicted,
              predictedUpper1: closestPoint.upper1,
              predictedLower1: closestPoint.lower1,
              predictedUpper2: closestPoint.upper2,
              predictedLower2: closestPoint.lower2,
              mae,
              mape,
              directionallyCorrect,
              inInterval68,
              inInterval95,
              crps,
              modelVersion: record.modelVersion,
            });

            // Mark checkpoint as scored on the record (never touches forecast data)
            await base44.asServiceRole.entities.ForecastRecord.update(record.id, { [flagKey]: true });

            // Queue calibration update for this context
            const ctxKey = `${record.asset}|${record.horizonBucket ?? 'medium'}|${record.regime ?? 'ranging'}|${record.modelVersion ?? ''}`;
            calibrationContexts.add(ctxKey);
          }

          summary.scored++;
        }
      } catch (recErr: any) {
        console.error(`[scoreForecastsJob] Error processing record ${record.id}:`, recErr.message);
        summary.errors++;
      }
    }

    // Update calibration for all affected contexts
    if (!dryRun) {
      for (const ctx of calibrationContexts) {
        const [asset, horizon, regime, modelVersion] = ctx.split('|');
        await updateCalibration(base44, asset, horizon, regime, modelVersion);
        // Also update the 'all' regime rollup for this asset+horizon+modelVersion
        await updateCalibration(base44, asset, horizon, 'all', modelVersion);
      }
    }

    console.log(`[scoreForecastsJob] Done. processed=${summary.processed} scored=${summary.scored} skipped=${summary.skipped} errors=${summary.errors}`);
    return Response.json({ ok: true, dryRun, summary });
  } catch (err: any) {
    console.error('[scoreForecastsJob] Fatal error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});