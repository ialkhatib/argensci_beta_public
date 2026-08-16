import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronUp, Zap, ShoppingCart, Loader2, Trash2 } from "lucide-react";

function formatDate(ts) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function CreditHistory({ isAuthenticated }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !isAuthenticated) return;
    setLoading(true);
    base44.entities.CreditLedger.list("-timestamp", 50)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          Credit History
          <a
            href="mailto:i@argensci.com"
            onClick={e => e.stopPropagation()}
            className="text-[10px] text-amber-400/70 hover:text-amber-400 underline underline-offset-2 transition-colors font-normal"
          >
            Need help?
          </a>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {open && (
        <div className="border-t border-white/5">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          ) : entries.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-600">No credit activity yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map(e => {
                const isSpend = e.amount < 0;
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isSpend ? "bg-rose-500/10" : "bg-emerald-500/10"}`}>
                      {e.type === "account_deactivation"
                        ? <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        : isSpend
                          ? <Zap className="h-3.5 w-3.5 text-rose-400" />
                          : <ShoppingCart className="h-3.5 w-3.5 text-emerald-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300">
                        {e.type === "account_deactivation"
                          ? "Account deactivation"
                          : e.type === "forecast_spend"
                            ? `Forecast — ${e.asset || ""}`
                            : "Credits purchased"}
                      </p>
                      <p className="text-xs text-slate-600">{formatDate(e.timestamp)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${isSpend ? "text-rose-400" : "text-emerald-400"}`}>
                        {isSpend ? `−${Math.abs(e.amount)}` : `+${e.amount}`}
                      </p>
                      <p className="text-xs text-slate-600 tabular-nums">{e.balanceAfter} left</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}