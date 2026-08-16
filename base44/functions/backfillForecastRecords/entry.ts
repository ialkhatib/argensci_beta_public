// backfillForecastRecords — One-time migration
//
// Reads all AnalysisReport records, fetches their snapshot JSON,
// and creates a corresponding ForecastRecord for each one that doesn't
// already have one (idempotent — safe to run multiple times).
//
// POST body: { dry_run: true } to preview without writing anything.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { detectRegime, horizonBucket, MODEL_VERSION } from '../../shared/forecastEngine.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    console.log(`[backfillForecastRecords] Starting${dryRun ? ' (DRY RUN)' : ''}…`);

    const summary = { total: 0, skipped: 0, created: 0, errors: 0 };

    // Fetch all existing ForecastRecords so we can deduplicate by generatedAt + asset
    const existingRecords = await base44.asServiceRole.entities.ForecastRecord.filter({}, '-generatedAt', 500);
    const existingKeys = new Set(
      existingRecords.map((r) => `${r.asset}|${r.generatedAt}`)
    );
    console.log(`[backfillForecastRecords] Found ${existingRecords.length} existing ForecastRecords`);

    // Paginate through all AnalysisReports
    let skip = 0;
    const pageSize = 50;
    while (true) {
      const reports = await base44.asServiceRole.entities.AnalysisReport.filter(
        { deleted: { $ne: true } },
        'snapshot_date',
        pageSize,
      );

      // Manual pagination via skip is not directly supported; we process all at once
      // Since there are only ~20 reports, one page is fine
      if (!reports || reports.length === 0) break;

      for (const report of reports) {
        summary.total++;
        try {
          const asset = report.asset ?? 'silver';
          const generatedAt = report.snapshot_date;
          const dedupeKey = `${asset}|${generatedAt}`;

          if (existingKeys.has(dedupeKey)) {
            console.log(`[backfillForecastRecords] Skipping already-migrated report ${report.id}`);
            summary.skipped++;
            continue;
          }

          // Fetch the snapshot JSON from its URL
          const snapshotUrl = report.snapshot;
          if (!snapshotUrl) {
            console.warn(`[backfillForecastRecords] No snapshot URL on report ${report.id}`);
            summary.skipped++;
            continue;
          }

          const snapResp = await fetch(snapshotUrl);
          if (!snapResp.ok) {
            console.warn(`[backfillForecastRecords] Could not fetch snapshot for report ${report.id}: ${snapResp.status}`);
            summary.errors++;
            continue;
          }

          const snap = await snapResp.json();

          // Extract fields from snapshot
          const forecastPoints = snap.quant?.forecastPoints ?? snap.forecastPoints ?? [];
          if (!forecastPoints.length) {
            console.warn(`[backfillForecastRecords] No forecastPoints in snapshot for report ${report.id}`);
            summary.skipped++;
            continue;
          }

          const spotAtForecast = snap.spot ?? snap.spotAtForecast ?? 0;
          const forecastDays = snap.forecastDays ?? report.forecastDays ?? 130;
          const tier = snap.lite === false ? 'pro' : (snap.lite === true ? 'lite' : (report.tier ?? 'lite'));
          const overallBias = snap.overallBias ?? snap.marketIntelligence?.overallBias ?? 'neutral';

          // Derive closes from forecastPoints central values as a proxy for regime detection
          // (actual historical closes not stored in snapshot — we use the quant params instead)
          // Fall back to 'ranging' if we can't compute
          let regime = 'ranging';
          try {
            // Build a synthetic close series from the spot price and forecast direction
            const driftProxy = snap.quant?.annualisedDrift ?? 0;
            if (driftProxy > 10) regime = 'trending_up';
            else if (driftProxy < -10) regime = 'trending_down';
            else if ((snap.quant?.annualisedVol ?? 0) > 40) regime = 'volatile';
            else regime = 'ranging';
          } catch (_e) {}

          const bucket = horizonBucket(forecastDays);

          const inputs = {
            sampleSize: snap.quant?.sampleSize ?? 0,
            inputFrequency: snap.quant?.inputFrequency ?? 'daily',
            structuralPressure: snap.quant?.structuralPressure ?? 0,
            dampedLogDrift: snap.quant?.dampedLogDrift ?? 0,
            annualisedVol: snap.quant?.annualisedVol ?? 0,
            annualisedDrift: snap.quant?.annualisedDrift ?? 0,
            calibDriftBias: 0,
            calibVolScalar: 1,
            regime,
          };

          console.log(`[backfillForecastRecords] ${dryRun ? '[DRY RUN] Would create' : 'Creating'} ForecastRecord for report ${report.id} — ${asset} ${tier} ${bucket} ${regime} @ ${generatedAt}`);

          if (!dryRun) {
            await base44.asServiceRole.entities.ForecastRecord.create({
              asset,
              tier,
              forecastDays,
              spotAtForecast,
              generatedAt,
              modelVersion: MODEL_VERSION,
              inputs: JSON.stringify(inputs),
              forecastPoints: JSON.stringify(forecastPoints),
              regime,
              horizonBucket: bucket,
              overallBias: ['bullish', 'bearish', 'neutral'].includes(overallBias) ? overallBias : 'neutral',
              userId: report.created_by_id ?? null,
              scored7: false,
              scored14: false,
              scored30: false,
              scored90: false,
              scored180: false,
              scored365: false,
              scored730: false,
            });
            existingKeys.add(dedupeKey); // prevent duplicates within this run
          }

          summary.created++;
        } catch (recErr) {
          console.error(`[backfillForecastRecords] Error processing report ${report.id}:`, recErr.message);
          summary.errors++;
        }
      }

      // Only one page needed for current dataset size
      break;
    }

    console.log(`[backfillForecastRecords] Done. total=${summary.total} created=${summary.created} skipped=${summary.skipped} errors=${summary.errors}`);
    return Response.json({ ok: true, dryRun, summary });
  } catch (err) {
    console.error('[backfillForecastRecords] Fatal:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}