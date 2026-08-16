import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Newspaper, ExternalLink } from "lucide-react";

function openViaGoogle(query) {
  window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
}

function openSourceViaGoogle(url, title) {
  // I'm Feeling Lucky — goes directly to the source article via Google
  const query = url || title;
  window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}&btnI=1`, "_blank", "noopener,noreferrer");
}

const DIR = {
  bullish: { icon: TrendingUp, color: "text-emerald-400", dotActive: "bg-emerald-400", bg: "border-emerald-500/30 bg-emerald-500/[0.06]" },
  bearish: { icon: TrendingDown, color: "text-rose-400", dotActive: "bg-rose-400", bg: "border-rose-500/30 bg-rose-500/[0.06]" },
  neutral: { icon: Minus, color: "text-slate-400", dotActive: "bg-slate-400", bg: "border-slate-500/20 bg-slate-500/[0.04]" },
};

export default function NewsRibbon({ headlines = [], loading = false }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (headlines.length < 2) return;
    timer.current = setInterval(() => setIdx((i) => (i + 1) % headlines.length), 6000);
    return () => clearInterval(timer.current);
  }, [headlines.length]);

  // Reset index when headlines change (asset switch)
  useEffect(() => { setIdx(0); }, [headlines]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-500 animate-pulse">
        <Newspaper className="h-3.5 w-3.5 shrink-0" />
        <span>Loading market headlines…</span>
      </div>
    );
  }

  if (!headlines.length) return null;

  const item = headlines[idx];
  const { icon: Icon, color, dotActive, bg } = DIR[item.direction] ?? DIR.neutral;

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 overflow-hidden ${bg}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
          >
            <button
              onClick={() => openSourceViaGoogle(item.source_url, item.title)}
              className="text-xs font-medium text-foreground truncate hover:underline underline-offset-2 text-left"
            >
              {item.title}
            </button>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 flex items-center gap-1">
              · {item.commencement} · {item.decay_timeline}
              <button onClick={() => openViaGoogle(item.title)} className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground ml-1 text-[10px]">
                <ExternalLink className="h-3 w-3" /> Search
              </button>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      {/* Dot nav */}
      <div className="flex items-center gap-1 shrink-0 ml-1">
        {headlines.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${i === idx ? dotActive : "bg-white/15"}`}
          />
        ))}
      </div>
    </div>
  );
}