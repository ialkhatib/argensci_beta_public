import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runIntelligencePipeline } from '../../shared/marketIntelligenceCore.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { asset = 'silver', points = [], currentPrice, forecastDays = 90, lite = false } = body;

    if (!points || points.length < 30) {
      return Response.json({ error: 'Need at least 30 price points for forecasting' }, { status: 400 });
    }

    const result = await runIntelligencePipeline(base44, { asset, points, currentPrice, forecastDays, lite });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});