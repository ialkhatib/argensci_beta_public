// runProAnalysis — Credit-gated Market Intelligence
//
// Flow:
//   1. Auth check → 401 if not logged in
//   2. Re-fetch fresh user record as service role to get authoritative credit count
//   3. Credit check → 402 if insufficient
//   4. Deduct credit BEFORE pipeline (prevents double-spend on retries)
//   5. Run intelligence pipeline
//   6. Return result + new credit balance
//   Note: if pipeline fails after deduction, credit is still spent (pipeline ran)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runIntelligencePipeline } from '../../shared/marketIntelligenceCore.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const sessionUser = await base44.auth.me();
    if (!sessionUser?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── 2. Fetch authoritative credit count via service role (never trust session cache) ──
    const freshUsers = await base44.asServiceRole.entities.User.filter({ id: sessionUser.id });
    const freshUser = freshUsers?.[0];
    if (!freshUser) return Response.json({ error: 'User not found' }, { status: 401 });

    const credits = typeof freshUser.credits === 'number' ? freshUser.credits : 0;

    // ── 3. Credit check ──────────────────────────────────────────────────────
    if (credits < 1) {
      return Response.json({ error: 'No credits remaining. Purchase more credits to run a Pro analysis.', credits: 0 }, { status: 402 });
    }

    // ── 3b. Idempotency guard — reject duplicate calls within 30s ────────────
    // This prevents double-charges if the client fires two requests back-to-back
    // (e.g. app re-mount, double-tap, network retry).
    const lastRunAt = freshUser.lastProForecastAt ? new Date(freshUser.lastProForecastAt).getTime() : 0;
    const secondsSinceLast = (Date.now() - lastRunAt) / 1000;
    if (secondsSinceLast < 30) {
      console.warn(`[runProAnalysis] Duplicate request blocked for user ${freshUser.id} (${secondsSinceLast.toFixed(1)}s since last run)`);
      return Response.json({ error: 'A forecast is already in progress. Please wait a moment before running another.' }, { status: 429 });
    }

    // ── 4. Parse request payload ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { asset = 'silver', points, currentPrice, forecastDays = 90 } = body;

    if (!points || points.length < 30) {
      return Response.json({ error: 'Need at least 30 price points for forecasting' }, { status: 400 });
    }

    // ── 5. Deduct credit BEFORE pipeline to prevent double-spend ────────────
    const newCredits = credits - 1;
    await base44.asServiceRole.entities.User.update(freshUser.id, { credits: newCredits, lastProForecastAt: new Date().toISOString() });
    console.log(`[runProAnalysis] Deducted 1 credit from user ${freshUser.id}. ${credits} → ${newCredits}`);

    // ── 5b. Write ledger entry ───────────────────────────────────────────────
    await base44.asServiceRole.entities.CreditLedger.create({
      userId: freshUser.id,
      userEmail: freshUser.email || '',
      amount: -1,
      balanceBefore: credits,
      balanceAfter: newCredits,
      type: 'forecast_spend',
      asset,
      timestamp: new Date().toISOString(),
    });

    // ── 6. Run intelligence pipeline (Pro mode) ───────────────────────────────
    const intelligenceData = await runIntelligencePipeline(base44, {
      asset,
      points,
      currentPrice,
      forecastDays,
      lite: false,
      userId: freshUser.id,
    });

    // ── 7. Return ─────────────────────────────────────────────────────────────
    return Response.json({
      ...intelligenceData,
      _creditsRemaining: newCredits,
    });
  } catch (error) {
    console.error('[runProAnalysis] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});