// Shared market intelligence pipeline — imported directly by both
// marketIntelligence and runProAnalysis to avoid nested function.invoke timeouts.

import { saveForecastRecord, getCalibration, detectRegime, horizonBucket, MODEL_VERSION } from './forecastEngine.ts';

function extractNumber(text) {
  if (!text) return null;
  const t = text.replace(/,/g, '');
  const match = t.match(/([\d]+(?:\.\d+)?)\s*(billion|million|trillion|thousand|bn|mn|tn|k|b|m)?\b/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();
  const multipliers = { billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12, million: 1e6, mn: 1e6, m: 1e6, thousand: 1e3, k: 1e3 };
  return val * (multipliers[unit] ?? 1);
}

function extractUnit(text) {
  if (!text) return '';
  const unitPatterns = [
    [/ounces?/i, 'oz'], [/tonnes?/i, 't'], [/tons?/i, 't'],
    [/percent|%/i, '%'], [/dollars?|\$/i, '$'], [/barrels?/i, 'bbl'],
  ];
  for (const [re, label] of unitPatterns) {
    if (re.test(text)) return label;
  }
  return '';
}

function decayTextToHours(text) {
  if (!text) return 24;
  const t = text.toLowerCase();
  const isYear  = t.includes('year');
  const isMonth = !isYear && t.includes('month');
  const isWeek  = !isYear && !isMonth && t.includes('week');
  const isDay   = !isYear && !isMonth && !isWeek && t.includes('day');
  const isHour  = !isYear && !isMonth && !isWeek && !isDay && t.includes('hour');
  const hpu = isYear ? 8760 : isMonth ? 720 : isWeek ? 168 : isDay ? 24 : isHour ? 1 : 24;
  const wm = { multi: 3, several: 3, many: 5, structural: 5 };
  for (const [w, mult] of Object.entries(wm)) {
    if (t.includes(w)) return mult * hpu;
  }
  const range = t.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) return Math.round(((parseFloat(range[1]) + parseFloat(range[2])) / 2) * hpu);
  const single = t.match(/(\d+(?:\.\d+)?)/);
  return Math.round((single ? parseFloat(single[1]) : 1) * hpu);
}

function themeAgeBonus(themeFirstSeen) {
  if (!themeFirstSeen) return 1.0;
  const ageHours = (Date.now() - new Date(themeFirstSeen).getTime()) / 3600000;
  if (isNaN(ageHours)) return 1.0;
  return 1.0 + Math.min(1.0, ageHours / 17520);
}

function topicFingerprint(title) {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')
    .filter(w => w.length > 4).sort().slice(0, 5).join('|');
}

function scoreTopic(t, forecastHorizonHours) {
  const lifetimeDays = (typeof t.extracted_lifetime_days === 'number' && t.extracted_lifetime_days > 0)
    ? t.extracted_lifetime_days
    : decayTextToHours(t.decay_timeline) / 24;
  const lifetimeHours = Math.round(lifetimeDays * 24);
  const isStructural = lifetimeHours >= 2160;
  const extractedValue = extractNumber(t.verbatim_quote);
  const extractedUnit  = extractUnit(t.verbatim_quote);
  const magnitude = typeof t.extracted_magnitude_pct === 'number' && t.extracted_magnitude_pct > 0
    ? Math.round(Math.min(15.0, Math.max(0.05, t.extracted_magnitude_pct)) * 100) / 100
    : 1.0;
  const immediacy = lifetimeHours >= 2160 ? 0.9 : lifetimeHours >= 720 ? 0.7 : lifetimeHours >= 48 ? 0.6 : 0.4;
  const hasQuote = t.verbatim_quote && t.verbatim_quote.length > 20;
  const repricingBoost = t.repricing_status === 'repriced' ? 0.10 : 0;
  const confidence = hasQuote ? Math.min(0.95, (isStructural ? 0.80 : 0.65) + repricingBoost) : 0.40;
  const historical_relevance = t.is_recurring
    ? Math.min(1.0, 0.3 + Math.min(0.7, (Date.now() - new Date(t.theme_first_seen || '2020-01-01').getTime()) / (2 * 365 * 24 * 3600000)))
    : 0.2;
  const persistenceRelevance = Math.min(1, lifetimeHours / forecastHorizonHours);
  const effectiveImmediacy = Math.max(immediacy, persistenceRelevance * 0.8);
  const ageBonus = t.is_recurring ? themeAgeBonus(t.theme_first_seen) : 1.0;
  const impact_score = Math.round(Math.abs(magnitude / 100) * lifetimeHours * confidence * (0.5 + 0.5 * historical_relevance) * 100) / 100;
  const rank_score   = Math.round(Math.abs(magnitude / 100) * lifetimeHours * confidence * effectiveImmediacy * (0.5 + 0.5 * historical_relevance) * ageBonus * 100) / 100;
  const displayDate = (t.is_recurring && t.theme_first_seen) ? t.theme_first_seen : t.published_date;
  return {
    ...t,
    magnitude, lifetime_hours: lifetimeHours, confidence, immediacy, historical_relevance,
    impact_score, rank_score, extracted_value: extractedValue, extracted_unit: extractedUnit,
    commencement: lifetimeHours >= 2160 ? 'already active' : lifetimeHours >= 720 ? 'within 1-3 months' : 'within weeks',
    source_context: t.verbatim_quote, title: t.headline, source_url: t.source_url,
    display_date: displayDate, repricing_status: t.repricing_status, repricing_trigger: t.repricing_trigger,
    has_counter_pressure: t.has_counter_pressure, counter_pressure_note: t.counter_pressure_note,
    is_realtime: t.is_realtime && !t.is_recurring,
  };
}

export async function runIntelligencePipeline(base44, { asset, points, currentPrice, forecastDays, lite, userId = null }) {
  const datedPoints = points.filter((p) => p.date && p.close > 0);
  let avgGapDays = 1;
  if (datedPoints.length >= 2) {
    const gaps = [];
    for (let i = 1; i < Math.min(datedPoints.length, 20); i++) {
      const g = (new Date(datedPoints[i].date).getTime() - new Date(datedPoints[i - 1].date).getTime()) / 86400000;
      if (g > 0) gaps.push(g);
    }
    avgGapDays = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 1;
  }
  const tradingPeriodsPerYear = avgGapDays <= 3 ? 252 : avgGapDays <= 10 ? 52 : 12;

  const closes = datedPoints.map((p) => p.close);
  const logReturns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const n = logReturns.length;
  const muPeriod = logReturns.reduce((s, r) => s + r, 0) / n;
  const variancePeriod = logReturns.reduce((s, r) => s + (r - muPeriod) ** 2, 0) / (n - 1);
  const mu = muPeriod * tradingPeriodsPerYear;
  const sigma = Math.sqrt(variancePeriod) * Math.sqrt(tradingPeriodsPerYear);
  const logDriftPerYear = mu - 0.5 * sigma * sigma;

  // ── Load calibration corrections for this context ────────────────────────
  const regime = detectRegime(closes);
  const bucket = horizonBucket(forecastDays);
  const calibration = await getCalibration(base44, asset, bucket, regime, MODEL_VERSION);
  const calibDriftBias = calibration?.driftBias ?? 0;
  const calibVolScalar = calibration?.volScalar ?? 1.0;
  if (calibration) {
    console.log(`[forecastEngine] Applied calibration: driftBias=${calibDriftBias} volScalar=${calibVolScalar} (${asset}/${bucket}/${regime})`);
  }

  let structuralPressure = 0;
  try {
    const drivers = await base44.asServiceRole.entities.StructuralDriver.filter({ isActive: true });
    for (const d of drivers) {
      if (d.asset === 'both' || d.asset === asset) structuralPressure += (d.pressureImpact ?? 0);
    }
  } catch (_e) {}

  const MAX_DRIFT = 0.5;
  // Apply calibration drift bias correction (subtracted because positive bias = over-prediction)
  const dampedLogDrift = (Math.abs(logDriftPerYear) > MAX_DRIFT ? 0.5 * logDriftPerYear : logDriftPerYear) + structuralPressure - calibDriftBias;
  // Apply calibration vol scalar (widens/tightens cone based on historical coverage performance)
  const calibratedSigma = sigma * calibVolScalar;
  const riskFreeRate = 0.043;
  const calDays = Math.min(forecastDays, 730);
  const spot = currentPrice ?? closes[closes.length - 1];
  const today = new Date();
  const forecastPoints = [];
  for (let i = 1; i <= calDays; i++) {
    const t = i / 365;
    const sqrtT = Math.sqrt(t);
    const central = spot * Math.exp(dampedLogDrift * t);
    const FAT_Z1 = 1.53, FAT_Z2 = 2.78;
    // Use calibratedSigma so interval width is corrected by walk-forward coverage performance
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    forecastPoints.push({
      date: d.toISOString().slice(0, 10),
      central: Math.round(central * 100) / 100,
      upper1: Math.round(central * Math.exp(calibratedSigma * sqrtT * FAT_Z1) * 100) / 100,
      upper2: Math.round(central * Math.exp(calibratedSigma * sqrtT * FAT_Z2) * 100) / 100,
      lower1: Math.round(central * Math.exp(-calibratedSigma * sqrtT * FAT_Z1) * 100) / 100,
      lower2: Math.round(central * Math.exp(-calibratedSigma * sqrtT * FAT_Z2) * 100) / 100,
    });
  }

  const finalCentral = forecastPoints[forecastPoints.length - 1];
  const pctChange = ((finalCentral.central - spot) / spot) * 100;
  const recentPoints = datedPoints.slice(-30);
  const recentHigh = Math.max(...recentPoints.map((p) => p.high ?? p.close));
  const recentLow  = Math.min(...recentPoints.map((p) => p.low  ?? p.close));
  const assetName = asset === 'gold' ? 'Gold' : 'Silver';
  const todayDate = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const forecastHorizonHours = calDays * 24;

  // Structural driver seeds for prompt
  let activeDriverSeeds = '';
  try {
    const drivers = await base44.asServiceRole.entities.StructuralDriver.filter({ isActive: true });
    const relevant = drivers.filter(d => d.asset === 'both' || d.asset === asset);
    if (relevant.length > 0) {
      activeDriverSeeds = `\nKNOWN STRUCTURAL DRIVERS (already confirmed active — you MUST search for the latest update on each and include them unless they have clearly fully reversed):\n` +
        relevant.map(d => `- "${d.title}": ${d.description ?? ''} (direction: ${d.direction ?? 'unknown'})`).join('\n') + '\n';
    }
  } catch (_e) {}

  const discoveryTopicCount = lite ? '3-4' : '6-8';
  const liteRecencyWarning = lite
    ? `\nCRITICAL FOR THIS RUN: This is a Lite forecast. Every non-structural topic MUST have a published_date within the last 90 days (after ${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}). Do NOT include one-off events from 2024 or earlier — they are stale. Structural/recurring themes (is_recurring: true) may be older but must still be actively relevant today.

RELATIONAL LANGUAGE CONSISTENCY (mandatory for every topic before outputting):
- Re-read your headline and verbatim_quote together and verify the DIRECTION of change is identical in both.
- Directional verbs that must match: rises/falls, increases/decreases, surges/plunges, expands/contracts, tightens/loosens, inflows/outflows, buys/sells, raises/cuts, stronger/weaker, higher/lower, growing/shrinking.
- If the quote says prices ROSE, the headline must NOT say "prices fall" or use any falling synonym.
- If the quote says demand INCREASED, direction must be "bullish", not "bearish" or "neutral".
- If you detect any mismatch between the headline verb, the verbatim_quote direction, and the direction field, CORRECT all three to match the quote before outputting — the quote is the ground truth.
- Never use a vague directional word (e.g. "moves", "shifts", "changes") when the quote specifies a clear direction.
\n`
    : '';

  const discoveryPrompt = `You are a market data extraction agent. Your job is to FIND and QUOTE — not to analyse or score.

TODAY: ${todayDate}
THIRTY DAYS AGO: ${thirtyDaysAgo}
${liteRecencyWarning}${activeDriverSeeds}
TASK: Search the web and identify exactly ${discoveryTopicCount} DISTINCT market-moving topics for ${assetName} right now.

RECENCY RULES:
- PRIORITY 1: Find articles published after ${thirtyDaysAgo} (last 30 days). These should make up the majority of your headlines. Search for recent news actively.
- PRIORITY 2: Structural or policy-driven themes MAY be included even if the originating event is older than 30 days, provided: (a) the theme is still actively exerting price pressure today, and (b) you can find ANY article — even a background explainer or market analysis — that discusses its ongoing relevance. In that case, published_date must reflect the article date you found.
- MANDATORY STRUCTURAL CHECKS: Always search for and consider the following categories regardless of how recently they generated headlines — (1) supply restrictions or disruptions affecting ${assetName} production or exports, (2) long-term demand shifts (e.g. industrial, technological, or geopolitical demand changes), (3) monetary policy trajectories that have multi-year relevance for ${assetName} pricing, (4) active wars, conflicts, or geopolitical crises driving safe-haven demand for ${assetName}, (5) the canonical precious metals research list — prioritized by causal weight, not alphabetically: first, structural supply-demand balance (primary mine supply vs. secondary scrap dynamics, and any multi-year structural deficit or surplus); second, ${asset === 'silver' ? 'silver' : 'gold'} industrial-to-investment demand intensity (e.g. solar/photovoltaic capacity, electronics, or safe-haven flows); third, real yields (TIPS) and the USD strength (DXY) inverse correlation as macro rate drivers; fourth, institutional positioning (e.g. COMEX net flows or major ETF movements) as a sentiment/flow signal; and finally, the Gold/Silver Ratio as a secondary relative-valuation cross-check, not a primary causal driver. In addition, always explicitly search for recent developments in the following high-priority categories: (a) investment demand — ETF inflows/outflows, coin and bar demand, futures positioning; (b) the US Dollar (DXY) and real yields (TIPS/breakevens) and their current directional impact on ${assetName}; (c) physical inventory tightness — COMEX registered stocks, LBMA vault levels, lease rates, any reported delivery stress or liquidity squeeze; (d) recycling supply response — whether scrap/secondary supply is rising or falling in response to the current price level; (e) global manufacturing activity — not just China, but also the US, EU, India, and Southeast Asia PMI trends and their implications for ${assetName} industrial demand. Including, but not limited to, these core metrics — you are expected to look for and include any other structural driver that completes the set if it is currently moving the market. IMPORTANT: These categories define what to actively search for and evaluate — they are NOT instructions to surface a topic item for every category. Apply all existing relevance filters exactly as before: only include a topic if it passes the recency rules, is not stale, and would genuinely appear in a final report by an expert researcher. If a category yields nothing currently market-moving, omit it silently. Include whichever of these are currently active.
- OMIT one-off events (e.g. a single past CPI print, a one-time trade release) that were fully priced in within days and have no ongoing effect.
- Do NOT recycle old news that has no current market relevance. But do NOT dismiss a slow-moving structural story simply because it did not generate a new headline in the past 30 days.

For each topic, return:
  1. A concise headline (max 100 chars) stating what the news IS — do not editorialize
  2. ONE verbatim sentence copied exactly from the source article that most directly supports the headline
  3. The direction of price pressure: "bullish", "bearish", or "neutral"
  4. The publication date of the primary source — must be the date of the article you actually found, NOT a historical event date. NEVER output ${todayDate}.
  5. The source URL (must be real — if uncertain, use the source's topic/search page)
  6. decay_timeline: a plain-English description of how long the pressure lasts from today
  7. extracted_lifetime_days: your best estimate as a NUMBER of days this pressure will persist from today
  8. extracted_magnitude_pct: your best estimate of the PERCENTAGE PRICE MOVE this event could drive on ${assetName}, expressed as a positive number
  9. Whether this is a recurring/structural theme (true) or a one-off event (false)
  10. If recurring: when did this theme FIRST become relevant to ${assetName} prices (YYYY-MM-DD)
  11. repricing_status: "fresh" | "active" | "repriced" | "stale"
  12. repricing_trigger: (only for "repriced") one sentence describing what NEW event reactivated this theme
  13. has_counter_pressure: true ONLY if this single topic simultaneously contains a meaningful opposing force
  14. counter_pressure_note: (only when has_counter_pressure is true) ONE brief sentence naming the opposing force

ADDITIONAL STRICT RULES:
- Each topic must be DISTINCT. Do not report two stories about the same underlying driver.
- verbatim_quote MUST be a real copied sentence from the article, not paraphrased. If you cannot find a real sentence to copy, set verbatim_quote to an empty string — do NOT fabricate a quote.
- OMIT any topic where repricing_status would be "stale".
- NEVER invent a source_url. If you are not certain the URL exists, use the publication's homepage or topic search page instead.
- Do NOT include numerical statistics (prices, percentages, volumes) in the headline unless they appear verbatim in the article you found.
- SELF-CONSISTENCY CHECK (mandatory before outputting each topic): Re-read the verbatim_quote and verify that (a) the direction of change described in the headline matches what the quote actually says (e.g. if the quote says a duty was RAISED or INCREASED, the headline must not say "slashes" or "cuts"; if the quote describes INFLOWS, the headline must not say "outflows"), (b) the direction field (bullish/bearish/neutral) is consistent with both the headline and the quote, and (c) any directional verb in the headline (slashes, surges, raises, cuts, falls, rises, outflows, inflows, etc.) correctly reflects the actual direction of the event as described in the quote. If the headline conflicts with the quote, correct the headline before outputting — do NOT output a topic where the headline contradicts the verbatim_quote.

Return a JSON object with a single key "topics" containing the array.`;

  const discoverySchema = {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            headline:                  { type: 'string' },
            verbatim_quote:            { type: 'string' },
            direction:                 { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
            published_date:            { type: 'string' },
            source_url:                { type: 'string' },
            decay_timeline:            { type: 'string' },
            extracted_lifetime_days:   { type: 'number' },
            extracted_magnitude_pct:   { type: 'number' },
            is_recurring:              { type: 'boolean' },
            theme_first_seen:          { type: 'string' },
            repricing_status:          { type: 'string', enum: ['fresh', 'active', 'repriced', 'stale'] },
            repricing_trigger:         { type: 'string' },
            has_counter_pressure:      { type: 'boolean' },
            counter_pressure_note:     { type: 'string' },
          },
          required: ['headline', 'verbatim_quote', 'direction', 'decay_timeline', 'extracted_lifetime_days', 'extracted_magnitude_pct', 'is_recurring', 'has_counter_pressure'],
        },
      },
    },
    required: ['topics'],
  };

  const discoveryResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: discoveryPrompt,
    add_context_from_internet: true,
    model: 'gemini_3_flash',
    response_json_schema: discoverySchema,
  });

  const rawTopics = discoveryResult?.topics ?? [];

  const tier1Domains = [
    'reuters.com', 'bloomberg.com', 'cnbc.com', 'ft.com', 'wsj.com',
    'marketwatch.com', 'apnews.com', 'bbc.com', 'theguardian.com',
    'investing.com', 'kitco.com', 'goldprice.org', 'silverprice.org',
    'federalreserve.gov', 'imf.org', 'worldbank.org', 'bis.org',
  ];
  function isTier1(url) {
    if (!url) return false;
    try { return tier1Domains.some(d => new URL(url).hostname.replace(/^www\./, '').endsWith(d)); }
    catch { return false; }
  }
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

  const sanitisedTopics = rawTopics.map((t) => {
    if (!t.published_date) return t;
    const pubMs = new Date(t.published_date).getTime();
    if (isNaN(pubMs)) return { ...t, published_date: undefined };
    if (pubMs >= twoDaysAgo) return isTier1(t.source_url) ? { ...t, is_realtime: true } : { ...t, published_date: undefined };
    return t;
  });

  // For lite mode: reject topics with a published_date older than 6 months unless structural/recurring
  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;

  const seenFingerprints = new Set();
  const uniqueTopics = sanitisedTopics.filter((t) => {
    if (t.repricing_status === 'stale' && !t.is_recurring) return false;
    // Lite-only staleness gate: drop non-structural topics with dates older than 6 months
    if (lite && t.published_date && !t.is_recurring) {
      const pubMs = new Date(t.published_date).getTime();
      if (!isNaN(pubMs) && pubMs < sixMonthsAgo) return false;
    }
    const fp = topicFingerprint(t.headline);
    if (seenFingerprints.has(fp)) return false;
    seenFingerprints.add(fp);
    return true;
  });

  const processedTopics = uniqueTopics.map((t) => scoreTopic(t, forecastHorizonHours));
  processedTopics.sort((a, b) => b.rank_score - a.rank_score);

  // Gap-fill pass (Pro only)
  let gapFillTopics = [];
  if (!lite) {
    const canonicalCommon = [
      'US real yields', 'US Dollar (DXY)', 'Federal Reserve policy', 'Inflation expectations',
      'Liquidity / financial conditions', 'Recession and growth expectations', 'Geopolitical risk',
      'Financial market stress', 'Sovereign debt / fiscal sustainability',
      'Safe haven demand and flows', 'Safe haven effects on precious metals',
      'Mine production', 'Recycling (scrap supply)', 'Producer-country disruptions',
      'Futures/options positioning and investment sentiment',
    ];
    const canonicalSilver = [
      'Solar PV demand', 'Electronics demand', 'EV demand',
      'AI/data-centre electrical infrastructure demand', 'Medical demand',
      'Global manufacturing PMI', 'China PMI', 'Industrial production', 'Green-energy policy',
      'Byproduct nature of silver mining', 'Copper, zinc and lead mine production',
      'Structural supply deficit', 'Above-ground silver inventories', 'Gold-to-silver ratio',
    ];
    const canonicalGold = [
      'Central bank purchases/sales', 'Reserve diversification and de-dollarization',
      'Jewellery demand', 'India physical demand', 'China physical demand',
      'ETF flows', 'Physical bar and coin demand',
    ];
    const canonicalList = [...canonicalCommon, ...(asset === 'silver' ? canonicalSilver : canonicalGold)];
    const coveredFingerprints = new Set(processedTopics.map(t => topicFingerprint(t.title)));
    const missingDrivers = canonicalList.filter(driver => !coveredFingerprints.has(topicFingerprint(driver)));

    if (missingDrivers.length > 0) {
      const gapFillPrompt = `You are a market data extraction agent doing a FINAL GAP-FILL check.

TODAY: ${todayDate}
ASSET: ${assetName}

The main discovery pass already found topics covering many drivers. You must ONLY search for drivers from the list below that are currently market-moving and have NOT yet been covered.

MISSING DRIVERS TO CHECK:
${missingDrivers.map((d, i) => `${i + 1}. ${d}`).join('\n')}

RULES:
- Search the web for each missing driver above.
- ONLY return a topic entry if: (a) there is currently active, market-moving news or a structural dynamic for ${assetName} related to that driver, AND (b) the driver is not stale or fully priced-in one-off news.
- If a driver has nothing currently relevant, do NOT include it. Return an empty array if nothing qualifies.
- Do NOT duplicate drivers already covered by the main pass.
- Apply the same recency and relevance standards as the main discovery pass.
- For each qualifying driver, return the same full schema as the main pass.

Return a JSON object with a single key "topics" containing the array (may be empty).`;

      const gapFillResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: gapFillPrompt,
        add_context_from_internet: true,
        model: 'gemini_3_flash',
        response_json_schema: discoverySchema,
      });

      const rawGapTopics = gapFillResult?.topics ?? [];
      const sanitisedGap = rawGapTopics.map((t) => {
        if (!t.published_date) return t;
        const pubMs = new Date(t.published_date).getTime();
        if (isNaN(pubMs)) return { ...t, published_date: undefined };
        if (pubMs >= twoDaysAgo) return isTier1(t.source_url) ? { ...t, is_realtime: true } : { ...t, published_date: undefined };
        return t;
      }).filter((t) => {
        if (t.repricing_status === 'stale' && !t.is_recurring) return false;
        const fp = topicFingerprint(t.headline);
        if (seenFingerprints.has(fp)) return false;
        seenFingerprints.add(fp);
        return true;
      });

      gapFillTopics = sanitisedGap.map((t) => scoreTopic(t, forecastHorizonHours));
    }
  }

  const allTopics = [...processedTopics, ...gapFillTopics];
  allTopics.sort((a, b) => b.rank_score - a.rank_score);

  const seedsForPrompt = allTopics.map((t, i) =>
    `[${i + 1}] "${t.headline}" (${t.direction}) — quote: "${t.verbatim_quote}"`
  ).join('\n');

  const synthesisPrompt = `You are a senior commodities strategist. You have been given a set of VERIFIED market topics for ${assetName} (see below).

TODAY: ${todayDate}

VERIFIED MARKET TOPICS (use ONLY these — do not invent new ones):
${seedsForPrompt}

QUANTITATIVE MODEL OUTPUT:
- Spot price: $${spot.toFixed(2)}/oz
- ${calDays}-day median forecast: $${finalCentral.central.toFixed(2)}/oz (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)
- 68% CI: $${finalCentral.lower1.toFixed(2)} – $${finalCentral.upper1.toFixed(2)}/oz
- 95% CI: $${finalCentral.lower2.toFixed(2)} – $${finalCentral.upper2.toFixed(2)}/oz
- Annualised vol: ${(sigma * 100).toFixed(1)}%, damped drift: ${(dampedLogDrift * 100).toFixed(1)}%
- 30-period range: $${recentLow.toFixed(2)} – $${recentHigh.toFixed(2)}/oz

Your tasks:
1. Write model_summary: one sentence on the quantitative projection using ONLY the numbers provided above.
2. Determine overall_bias and bias_strength from the verified topics above.
3. Write macro_factors: for each verified topic above, create one macro factor entry. Do NOT add factors not in the list. The summary field must be grounded in the verbatim quote for that topic — do not state specific prices, percentages, or quantities unless they appear in the quote.
4. Write key_risk_events: extract ONLY upcoming events explicitly mentioned or directly named in the topics. Do not infer or invent events.
5. Write ai_narrative: 3-5 sentences that synthesize the verified topics and the quantitative numbers above. Do NOT state any price, percentage, or quantity that is not in either the verified topics or the quantitative model output above.
6. Write confidence_note (required), upside_scenario (required), downside_scenario (required). All three must reference only verified topics — never invent catalysts or statistics.

STRICT GROUNDING RULES (violations make the output unusable):
- NEVER state a specific price, number, percentage, date, or company/institution name that does not appear in the verified topics or the quantitative model output above.
- NEVER extrapolate trends beyond what the verified quotes support.
- If a topic's quote is vague, keep the corresponding macro_factor summary equally vague — do not sharpen it with invented detail.
- When uncertain, use hedged language ("may", "could", "some analysts suggest") rather than asserting a fact.
- CURRENCY NORMALIZATION: If a macro_factor summary contains a non-standard or regional currency (e.g. Rs crore, INR, CNY, AED, BRL, MXN, etc.), keep the original figure but immediately append a USD equivalent in parentheses. Use approximate conversion rates from your knowledge. Example: "Rs 4,286 crore (approx. $515 million USD)". Do NOT normalize USD, EUR, GBP, or JPY — those are already standard for a global commodities audience.`;

  const synthesisSchema = {
    type: 'object',
    properties: {
      model_summary:     { type: 'string' },
      overall_bias:      { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
      bias_strength:     { type: 'string', enum: ['strong', 'moderate', 'weak'] },
      macro_factors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:    { type: 'string' },
            impact:  { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
            weight:  { type: 'string', enum: ['high', 'medium', 'low'] },
            summary: { type: 'string' },
          },
        },
      },
      key_risk_events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            event:            { type: 'string' },
            date_approximate: { type: 'string' },
            potential_impact: { type: 'string', enum: ['high', 'medium', 'low'] },
            direction:        { type: 'string', enum: ['upside', 'downside', 'both'] },
          },
        },
      },
      ai_narrative:      { type: 'string' },
      confidence_note:   { type: 'string' },
      upside_scenario:   { type: 'string' },
      downside_scenario: { type: 'string' },
    },
    required: ['model_summary', 'overall_bias', 'macro_factors', 'ai_narrative', 'upside_scenario', 'downside_scenario', 'confidence_note'],
  };

  const synthesisResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: synthesisPrompt,
    model: 'claude-sonnet-5',
    response_json_schema: synthesisSchema,
  });

  const generatedAt = new Date().toISOString();

  // ── Save forecast record for future scoring (fire-and-forget, non-blocking) ──
  saveForecastRecord(base44, {
    asset,
    tier: lite ? 'lite' : 'pro',
    forecastDays: calDays,
    spotAtForecast: spot,
    generatedAt,
    inputs: {
      sampleSize: n,
      inputFrequency: tradingPeriodsPerYear === 252 ? 'daily' : tradingPeriodsPerYear === 52 ? 'weekly' : 'monthly',
      structuralPressure: Math.round(structuralPressure * 10000) / 100,
      dampedLogDrift: Math.round(dampedLogDrift * 10000) / 100,
      annualisedVol: Math.round(sigma * 10000) / 100,
      annualisedDrift: Math.round(mu * 10000) / 100,
      calibDriftBias,
      calibVolScalar,
      regime,
    },
    forecastPoints,
    closes,
    overallBias: synthesisResult?.overall_bias ?? 'neutral',
    userId: userId ?? null,
  }).catch((e) => console.error('[forecastEngine] Background save error:', e?.message));

  return {
    asset,
    assetName,
    lite,
    generatedAt,
    spot,
    forecastDays: calDays,
    modelVersion: MODEL_VERSION,
    regime,
    horizonBucket: bucket,
    calibration: calibration ? { driftBias: calibDriftBias, volScalar: calibVolScalar } : null,
    quant: {
      annualisedVol:      Math.round(sigma * 10000) / 100,
      annualisedDrift:    Math.round(mu * 10000) / 100,
      dampedLogDrift:     Math.round(dampedLogDrift * 10000) / 100,
      structuralPressure: Math.round(structuralPressure * 10000) / 100,
      riskFreeRate:       riskFreeRate * 100,
      inputFrequency:     tradingPeriodsPerYear === 252 ? 'daily' : tradingPeriodsPerYear === 52 ? 'weekly' : 'monthly',
      sampleSize:         n,
      forecastPoints,
    },
    intelligence: {
      ...synthesisResult,
      news_ribbon: allTopics,
    },
  };
}