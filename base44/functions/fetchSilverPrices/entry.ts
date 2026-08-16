// Fetch silver (COMEX SI=F) from Yahoo Finance.
// Supports custom date ranges and interval (daily or weekly for long history).
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const ASSETS = {
      silver: { symbol: "SI=F", name: "Silver Futures (COMEX)", exchange: "COMEX" },
      gold:   { symbol: "GC=F", name: "Gold Futures (COMEX)",   exchange: "COMEX" },
    };
    const assetInfo = ASSETS[body.asset] || ASSETS.silver;
    const symbol = assetInfo.symbol;

    let url;
    if (body.dateFrom && body.dateTo) {
      const period1 = Math.floor(new Date(body.dateFrom).getTime() / 1000);
      const period2 = Math.floor(new Date(body.dateTo).getTime() / 1000);
      const interval = body.interval || "1d";
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${encodeURIComponent(interval)}`;
    } else {
      const range = body.range || "2y";
      const interval = body.interval || "1d";
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
    }

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!r.ok) return Response.json({ error: `Upstream ${r.status}` }, { status: 502 });

    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return Response.json({ error: "No chart data" }, { status: 502 });

    const round = (n) => (typeof n === "number" && isFinite(n) ? Math.round(n * 100) / 100 : null);
    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      const close = q.close?.[i];
      if (close == null) continue;
      points.push({
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        close: round(close),
        high: q.high?.[i] != null ? round(q.high[i]) : null,
        low: q.low?.[i] != null ? round(q.low[i]) : null,
        open: q.open?.[i] != null ? round(q.open[i]) : null,
      });
    }

    const meta = result.meta || {};
    return Response.json({
      symbol,
      name: assetInfo.name,
      currency: meta.currency || "USD",
      exchange: meta.fullExchangeName || assetInfo.exchange,
      regularMarketPrice: meta.regularMarketPrice ?? null,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      points,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});