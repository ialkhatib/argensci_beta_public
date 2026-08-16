import { jsPDF } from "jspdf";

// ─── Color palette (dark theme) ──────────────────────────────────────────────
const C = {
  bg:         [10, 12, 16],
  card:       [18, 22, 28],
  card2:      [22, 27, 35],
  border:     [40, 46, 58],
  amber:      [251, 191, 36],
  amberDim:   [180, 130, 20],
  amberFade:  [251, 191, 36, 40],
  white:      [241, 245, 249],
  slate2:     [226, 232, 240],
  slate3:     [203, 213, 225],
  slate4:     [148, 163, 184],
  slate5:     [100, 116, 139],
  slate6:     [71,  85, 105],
  emerald:    [52,  211, 153],
  rose:       [251, 113, 133],
  emeraldDim: [16,  185, 129],
  roseDim:    [244, 63,  94],
};

const PAGE_W    = 210;
const PAGE_H    = 297;
const MARGIN    = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LH_BODY   = 5.2;   // normal body line-height
const LH_SM     = 4.5;   // small text line-height

// ─── Primitives ───────────────────────────────────────────────────────────────
function setFill(doc, color) { doc.setFillColor(...color); }
function setDraw(doc, color) { doc.setDrawColor(...color); }
function setTxt(doc,  color) { doc.setTextColor(...color); }

function rect(doc, x, y, w, h, color, r = 0) {
  setFill(doc, color);
  r > 0 ? doc.roundedRect(x, y, w, h, r, r, "F") : doc.rect(x, y, w, h, "F");
}
function strokeRect(doc, x, y, w, h, color, lw = 0.25, r = 3) {
  setDraw(doc, color);
  doc.setLineWidth(lw);
  doc.roundedRect(x, y, w, h, r, r, "S");
}
function line(doc, x1, y1, x2, y2, color, lw = 0.3) {
  setDraw(doc, color);
  doc.setLineWidth(lw);
  doc.line(x1, y1, x2, y2);
}
function txt(doc, text, x, y, color, size, bold = false, align = "left", maxWidth) {
  doc.setFontSize(size);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  setTxt(doc, color);
  const opts = { align };
  if (maxWidth) opts.maxWidth = maxWidth;
  doc.text(String(text ?? "—"), x, y, opts);
}

// Wrapped text block — returns new Y after last line
function wrapTxt(doc, text, x, y, color, size, bold = false, maxW = CONTENT_W, lh = LH_BODY) {
  doc.setFontSize(size);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  setTxt(doc, color);
  const lines = doc.splitTextToSize(String(text ?? ""), maxW);
  doc.text(lines, x, y);
  return y + lines.length * lh;
}

// ─── Page management ─────────────────────────────────────────────────────────
function newPage(doc) {
  doc.addPage();
  rect(doc, 0, 0, PAGE_W, PAGE_H, C.bg);
  return MARGIN + 8;
}
function checkY(doc, y, needed = 24) {
  if (y + needed > PAGE_H - 18) return newPage(doc);
  return y;
}

// ─── Section header ───────────────────────────────────────────────────────────
function sectionHeader(doc, y, label) {
  y = checkY(doc, y, 14);
  // Amber left accent
  rect(doc, MARGIN, y - 1, 2.5, 7, C.amber, 1);
  txt(doc, label.toUpperCase(), MARGIN + 6, y + 4.5, C.amber, 7, true);
  y += 10;
  line(doc, MARGIN, y - 2, PAGE_W - MARGIN, y - 2, C.border, 0.2);
  return y + 1;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function statCard(doc, x, y, w, h, label, value, sub) {
  rect(doc, x, y, w, h, C.card, 3);
  strokeRect(doc, x, y, w, h, C.border, 0.2, 3);
  txt(doc,  label, x + 4, y + 5.5,  C.slate5, 6.5);
  txt(doc,  value, x + 4, y + 12,   C.white,  10, true);
  if (sub) txt(doc, sub, x + 4, y + 17, C.slate6, 6);
}

// ─── Chart renderer (canvas → PDF image) ─────────────────────────────────────
async function renderChartToPdf(doc, historicalData, forecastPoints, spot, y, h = 70) {
  const CW = 800; // canvas px width
  const CH = Math.round(CW * (h / CONTENT_W)); // maintain aspect ratio
  const canvas = document.createElement("canvas");
  canvas.width  = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, CW, CH);

  const padL = 52, padR = 16, padT = 16, padB = 32;
  const plotW = CW - padL - padR;
  const plotH = CH - padT - padB;

  // Merge historical + forecast for y-range
  const allPoints = [
    ...historicalData.map(d => d.close),
    ...(forecastPoints ?? []).flatMap(d => [d.central, d.upper2, d.lower2]),
  ].filter(Boolean);
  const minY = Math.min(...allPoints) * 0.99;
  const maxY = Math.max(...allPoints) * 1.01;

  const allDates = [
    ...historicalData.map(d => d.date),
    ...(forecastPoints ?? []).map(d => d.date),
  ];
  const totalPts = allDates.length;

  const px = (i) => padL + (i / (totalPts - 1)) * plotW;
  const py = (v) => padT + plotH - ((v - minY) / (maxY - minY)) * plotH;

  // Grid lines
  ctx.strokeStyle = "#282e3a";
  ctx.lineWidth = 0.8;
  const gridCount = 5;
  for (let i = 0; i <= gridCount; i++) {
    const v = minY + (i / gridCount) * (maxY - minY);
    const gy = py(v);
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(CW - padR, gy);
    ctx.stroke();
    // Y-axis labels
    ctx.fillStyle = "#64748b";
    ctx.font = "22px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`$${v.toFixed(0)}`, padL - 4, gy + 7);
  }

  // X-axis labels (monthly ticks)
  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.floor(totalPts / 8));
  for (let i = 0; i < totalPts; i += step) {
    const d = new Date(allDates[i]);
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    ctx.fillText(label, px(i), CH - 6);
  }

  // ── Forecast outer cone (95%) fill ───────────────────────────────────────
  if (forecastPoints?.length) {
    const histLen = historicalData.length;
    const bridgeIdx = histLen - 1;

    // Upper2 fill
    ctx.beginPath();
    forecastPoints.forEach((fp, fi) => {
      const xi = px(bridgeIdx + fi);
      fi === 0 ? ctx.moveTo(xi, py(fp.upper2)) : ctx.lineTo(xi, py(fp.upper2));
    });
    [...forecastPoints].reverse().forEach((fp, fi) => {
      ctx.lineTo(px(bridgeIdx + forecastPoints.length - 1 - fi), py(fp.lower2));
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(251,191,36,0.07)";
    ctx.fill();

    // Inner cone (68%) fill
    ctx.beginPath();
    forecastPoints.forEach((fp, fi) => {
      const xi = px(bridgeIdx + fi);
      fi === 0 ? ctx.moveTo(xi, py(fp.upper1)) : ctx.lineTo(xi, py(fp.upper1));
    });
    [...forecastPoints].reverse().forEach((fp, fi) => {
      ctx.lineTo(px(bridgeIdx + forecastPoints.length - 1 - fi), py(fp.lower1));
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(251,191,36,0.13)";
    ctx.fill();

    // Outer cone border lines (dashed)
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(251,191,36,0.35)";
    ctx.lineWidth = 1.5;
    ["upper1", "lower1"].forEach(key => {
      ctx.beginPath();
      forecastPoints.forEach((fp, fi) => {
        const xi = px(bridgeIdx + fi);
        fi === 0 ? ctx.moveTo(xi, py(fp[key])) : ctx.lineTo(xi, py(fp[key]));
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Central forecast line (solid amber dashed)
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    forecastPoints.forEach((fp, fi) => {
      const xi = px(bridgeIdx + fi);
      fi === 0 ? ctx.moveTo(xi, py(fp.central)) : ctx.lineTo(xi, py(fp.central));
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Historical price line (silver/gold) ───────────────────────────────────
  const lineColor = "#e2e8f0";
  // Area fill
  ctx.beginPath();
  historicalData.forEach((d, i) => {
    i === 0 ? ctx.moveTo(px(i), py(d.close)) : ctx.lineTo(px(i), py(d.close));
  });
  ctx.lineTo(px(historicalData.length - 1), padT + plotH);
  ctx.lineTo(px(0), padT + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, "rgba(226,232,240,0.22)");
  grad.addColorStop(1, "rgba(226,232,240,0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Price stroke
  ctx.beginPath();
  historicalData.forEach((d, i) => {
    i === 0 ? ctx.moveTo(px(i), py(d.close)) : ctx.lineTo(px(i), py(d.close));
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Spot dot at the last historical price
  const lastI = historicalData.length - 1;
  ctx.beginPath();
  ctx.arc(px(lastI), py(historicalData[lastI].close), 4, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24";
  ctx.fill();

  // Legend
  const lgY = padT - 2;
  ctx.font = "bold 20px sans-serif";

  // Historical
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(padL, lgY); ctx.lineTo(padL + 28, lgY); ctx.stroke();
  ctx.fillStyle = "#94a3b8"; ctx.textAlign = "left";
  ctx.fillText("Historical", padL + 32, lgY + 6);

  // Forecast median
  if (forecastPoints?.length) {
    ctx.strokeStyle = "#fbbf24";
    ctx.setLineDash([8, 5]);
    ctx.beginPath(); ctx.moveTo(padL + 160, lgY); ctx.lineTo(padL + 188, lgY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fbbf24";
    ctx.fillText("Forecast (median)", padL + 192, lgY + 6);

    // Cone
    ctx.fillStyle = "rgba(251,191,36,0.35)";
    ctx.fillRect(padL + 400, lgY - 8, 28, 14);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Uncertainty cone", padL + 436, lgY + 6);
  }

  const imgData = canvas.toDataURL("image/png");
  // Place chart
  doc.addImage(imgData, "PNG", MARGIN, y, CONTENT_W, h);
  return y + h + 4;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function exportForecastPdf({ result, calDays, externalConsensus, priceHistory }) {
  const { quant, intelligence, spot, assetName, generatedAt, lite } = result;
  const tier = lite ? "Lite" : "Pro";
  const finalPoint = quant?.forecastPoints?.[quant.forecastPoints.length - 1];
  const bias        = intelligence?.overall_bias ?? "neutral";
  const biasStrength = intelligence?.bias_strength ?? "";
  const genDate = generatedAt
    ? new Date(generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── PAGE 1 ─────────────────────────────────────────────────────────────────
  rect(doc, 0, 0, PAGE_W, PAGE_H, C.bg);

  // Header bar
  rect(doc, 0, 0, PAGE_W, 42, C.card);
  line(doc, 0, 42, PAGE_W, 42, C.border, 0.3);
  rect(doc, 0, 0, 4, 42, C.amber); // amber left stripe

  txt(doc, "ArgenSci", MARGIN + 6, 12, C.amber, 11, true);
  txt(doc, `Market Intelligence Report  ·  ${tier}`, MARGIN + 6, 19, C.slate3, 8.5);
  txt(doc, `${assetName}  ·  ${calDays}-Day Price Forecast`, MARGIN + 6, 25.5, C.slate4, 7.5);
  txt(doc, `Generated ${genDate}`, MARGIN + 6, 31.5, C.slate5, 6.5);

  const biasColor = bias === "bullish" ? C.emerald : bias === "bearish" ? C.rose : C.slate4;
  const biasLabel = `${biasStrength} ${bias} bias`.toUpperCase().trim();
  txt(doc, biasLabel, PAGE_W - MARGIN, 17, biasColor, 8, true, "right");
  txt(doc, `Vol σ = ${quant?.annualisedVol?.toFixed(1)}%  ·  ${quant?.inputFrequency ?? ""} data`, PAGE_W - MARGIN, 25, C.slate5, 6.5, false, "right");

  let y = 52;

  // ── Quant summary cards ────────────────────────────────────────────────────
  y = sectionHeader(doc, y, "Quantitative Model Output");
  const cardW = (CONTENT_W - 9) / 4;
  const cards = [
    { label: "Current Spot",       value: `$${spot?.toFixed(2)}`,                              sub: "per troy oz" },
    { label: "Central Forecast",   value: `$${finalPoint?.central?.toFixed(2)}`,               sub: `in ${calDays} days` },
    { label: "~68% Band",          value: `$${finalPoint?.lower1?.toFixed(0)}–${finalPoint?.upper1?.toFixed(0)}`, sub: "fat-tail adj." },
    { label: "~95% Band",          value: `$${finalPoint?.lower2?.toFixed(0)}–${finalPoint?.upper2?.toFixed(0)}`, sub: "t₄ quantiles" },
  ];
  cards.forEach((c, i) => {
    statCard(doc, MARGIN + i * (cardW + 3), y, cardW, 22, c.label, c.value, c.sub);
  });
  y += 26;
  txt(doc, "† Bands use Student-t₄ quantiles — not Gaussian — to account for fat tails in precious metal returns.", MARGIN, y, C.slate6, 6, false, "left", CONTENT_W);
  y += 8;

  // ── AI Narrative ──────────────────────────────────────────────────────────
  if (intelligence?.ai_narrative) {
    y = sectionHeader(doc, y, "AI Market Narrative");
    y = wrapTxt(doc, intelligence.ai_narrative, MARGIN, y, C.slate2, 8, false, CONTENT_W, LH_BODY);
    if (intelligence.confidence_note) {
      y += 4;
      y = wrapTxt(doc, `Note: ${intelligence.confidence_note}`, MARGIN, y, C.slate5, 7, false, CONTENT_W, LH_SM);
    }
    y += 8;
  }

  // ── Model summary ─────────────────────────────────────────────────────────
  if (intelligence?.model_summary) {
    y = checkY(doc, y, 18);
    const ms = doc.splitTextToSize(String(intelligence.model_summary), CONTENT_W - 10);
    const boxH = ms.length * LH_SM + 10;
    rect(doc, MARGIN, y, CONTENT_W, boxH, C.card, 3);
    strokeRect(doc, MARGIN, y, CONTENT_W, boxH, C.border, 0.2, 3);
    // Amber left accent inside box
    rect(doc, MARGIN, y, 2.5, boxH, C.amber, 1);
    wrapTxt(doc, intelligence.model_summary, MARGIN + 7, y + 6, C.amber, 7.5, false, CONTENT_W - 12, LH_SM);
    y += boxH + 7;
  }

  // ── Macro Factors ─────────────────────────────────────────────────────────
  if (intelligence?.macro_factors?.length) {
    y = checkY(doc, y, 18);
    y = sectionHeader(doc, y, "Macro Factors");

    for (const f of intelligence.macro_factors) {
      const summaryLines = f.summary ? doc.splitTextToSize(String(f.summary), CONTENT_W - 20) : [];
      const rowH = 12 + (summaryLines.length > 0 ? summaryLines.length * LH_SM + 4 : 0);
      y = checkY(doc, y, rowH + 4);

      const impactColor  = f.impact  === "bullish" ? C.emerald : f.impact  === "bearish" ? C.rose : C.slate4;
      const weightColor  = f.weight  === "high"    ? C.amber   : f.weight  === "medium"  ? C.slate4 : C.slate6;

      rect(doc, MARGIN, y, CONTENT_W, rowH, C.card, 3);
      strokeRect(doc, MARGIN, y, CONTENT_W, rowH, C.border, 0.15, 3);

      // Weight dot
      setFill(doc, weightColor);
      doc.circle(MARGIN + 6, y + 6, 1.8, "F");

      txt(doc, f.name, MARGIN + 12, y + 5, C.white, 8.5, true);

      // Impact pill
      const impactLabel = f.impact.toUpperCase();
      const impactW = impactLabel.length * 1.7 + 8;
      rect(doc, PAGE_W - MARGIN - impactW, y + 2, impactW, 7, impactColor.map(v => Math.round(v * 0.18)), 2);
      txt(doc, impactLabel, PAGE_W - MARGIN - impactW / 2, y + 6.5, impactColor, 6.5, true, "center");

      if (summaryLines.length > 0) {
        y += 12;
        wrapTxt(doc, f.summary, MARGIN + 12, y, C.slate4, 7, false, CONTENT_W - 20, LH_SM);
        y += summaryLines.length * LH_SM + 4;
      } else {
        y += rowH + 3;
      }
    }
    y += 5;
  }

  // ── Key Risk Events ───────────────────────────────────────────────────────
  if (intelligence?.key_risk_events?.length) {
    y = checkY(doc, y, 18);
    y = sectionHeader(doc, y, "Key Risk Events");

    for (const e of intelligence.key_risk_events) {
      y = checkY(doc, y, 18);
      const dirColor = e.direction === "upside" ? C.emerald : e.direction === "downside" ? C.rose : C.amber;
      rect(doc, MARGIN, y, CONTENT_W, 16, C.card, 3);
      strokeRect(doc, MARGIN, y, CONTENT_W, 16, C.border, 0.15, 3);

      // Direction accent bar
      rect(doc, MARGIN, y, 2.5, 16, dirColor, 1);

      txt(doc, e.event, MARGIN + 8, y + 5.5, C.white, 8.5, true, "left", CONTENT_W - 60);
      txt(doc, e.date_approximate ?? "", PAGE_W - MARGIN - 4, y + 5, C.slate4, 6.5, false, "right");
      txt(doc, `${e.direction ?? ""} · ${e.potential_impact ?? ""} impact`, PAGE_W - MARGIN - 4, y + 11.5, dirColor, 6.5, true, "right");

      y += 19;
    }
    y += 2;
  }

  // ── Tail Scenarios ────────────────────────────────────────────────────────
  if (intelligence?.upside_scenario || intelligence?.downside_scenario) {
    const upLines   = intelligence.upside_scenario   ? doc.splitTextToSize(intelligence.upside_scenario,   (CONTENT_W - 12) / 2 - 4) : [];
    const downLines = intelligence.downside_scenario ? doc.splitTextToSize(intelligence.downside_scenario, (CONTENT_W - 12) / 2 - 4) : [];
    const scenH = Math.max(upLines.length, downLines.length) * LH_SM + 22;
    y = checkY(doc, y, scenH + 14);
    y = sectionHeader(doc, y, "Tail Scenarios");

    const halfW = (CONTENT_W - 6) / 2;

    if (intelligence.upside_scenario) {
      rect(doc, MARGIN, y, halfW, scenH, [12, 30, 22], 3);
      strokeRect(doc, MARGIN, y, halfW, scenH, [30, 90, 55], 0.25, 3);
      txt(doc, "↑ UPPER BOUND SCENARIO", MARGIN + 5, y + 6, C.emerald, 7, true);
      txt(doc, `Target: $${finalPoint?.upper2?.toFixed(2)}/oz`, MARGIN + 5, y + 12.5, C.emeraldDim, 7.5, true);
      wrapTxt(doc, intelligence.upside_scenario, MARGIN + 5, y + 18, C.slate3, 7, false, halfW - 10, LH_SM);
    }

    if (intelligence.downside_scenario) {
      const sx = MARGIN + halfW + 6;
      rect(doc, sx, y, halfW, scenH, [30, 12, 18], 3);
      strokeRect(doc, sx, y, halfW, scenH, [90, 30, 45], 0.25, 3);
      txt(doc, "↓ LOWER BOUND SCENARIO", sx + 5, y + 6, C.rose, 7, true);
      txt(doc, `Target: $${finalPoint?.lower2?.toFixed(2)}/oz`, sx + 5, y + 12.5, C.roseDim, 7.5, true);
      wrapTxt(doc, intelligence.downside_scenario, sx + 5, y + 18, C.slate3, 7, false, halfW - 10, LH_SM);
    }
    y += scenH + 8;
  }

  // ── External Consensus ────────────────────────────────────────────────────
  const sources = externalConsensus?.sources;
  if (sources?.length) {
    y = checkY(doc, y, 20);
    y = sectionHeader(doc, y, "External Analyst Consensus");

    for (const s of sources) {
      const titleLines   = doc.splitTextToSize(String(s.title   ?? ""), CONTENT_W - 32);
      const summaryLines = doc.splitTextToSize(String(s.one_line ?? ""), CONTENT_W - 32);
      const rowH = titleLines.length * LH_BODY + summaryLines.length * LH_SM + 14;
      y = checkY(doc, y, rowH + 4);

      const verdictColor = s.verdict === "buy" ? C.emerald : s.verdict === "sell" ? C.rose : s.verdict === "hold" ? C.amber : C.slate4;
      rect(doc, MARGIN, y, CONTENT_W, rowH, C.card, 3);
      strokeRect(doc, MARGIN, y, CONTENT_W, rowH, C.border, 0.15, 3);

      txt(doc, s.source.toUpperCase(), MARGIN + 5, y + 6, C.slate5, 6.5, true);

      // Verdict pill
      const vLabel = s.verdict.toUpperCase();
      const vW = vLabel.length * 1.8 + 10;
      rect(doc, PAGE_W - MARGIN - vW, y + 2, vW, 7.5, verdictColor.map(v => Math.round(v * 0.18)), 2);
      txt(doc, vLabel, PAGE_W - MARGIN - vW / 2, y + 7, verdictColor, 6.5, true, "center");

      let ty = y + 11;
      ty = wrapTxt(doc, s.title,    MARGIN + 5, ty, C.slate2, 7.5, true,  CONTENT_W - 32, LH_BODY);
      ty += 1;
      ty = wrapTxt(doc, s.one_line, MARGIN + 5, ty, C.slate5, 6.5, false, CONTENT_W - 32, LH_SM);
      y += rowH + 4;
    }
    y += 2;
    txt(doc, "Sources retrieved via live web search · Not financial advice", MARGIN, y, C.slate6, 6);
    y += 8;
  }

  // ── Price Chart ───────────────────────────────────────────────────────────
  const chartH = 72; // mm
  y = checkY(doc, y, chartH + 16);
  y = sectionHeader(doc, y, "Price Chart & Forecast Projection");

  const histData = (priceHistory ?? []).filter(d => d.close != null);

  if (histData.length > 1) {
    y = await renderChartToPdf(doc, histData, quant?.forecastPoints, spot, y, chartH);
    txt(doc,
      "Chart shows historical spot price and forward projection cone (fat-tail adjusted, t₄). No event markers shown.",
      MARGIN, y, C.slate6, 6, false, "left", CONTENT_W);
    y += 8;
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    line(doc, MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13, C.border, 0.2);
    txt(doc, `ArgenSci  ·  Market Intelligence  ·  ${tier}`, MARGIN, PAGE_H - 8, C.slate6, 6);
    txt(doc, "Not financial advice. Model uses GBM with Student-t₄ fat-tail adjustment.", PAGE_W / 2, PAGE_H - 8, C.slate6, 6, false, "center");
    txt(doc, `Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 8, C.slate6, 6, false, "right");
  }

  const filename = `argensci-${tier.toLowerCase()}-${assetName.toLowerCase().replace(/\s+/g, "-")}-${calDays}d-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}