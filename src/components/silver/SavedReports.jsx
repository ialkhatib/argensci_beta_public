import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BookmarkPlus, Bookmark, Trash2, RotateCcw, ChevronDown, ChevronUp, Clock, ArchiveRestore } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const LITE_KEY = "argensci_lite_reports";
const MAX_LITE = 3;

function loadLiteReports() {
  try { return JSON.parse(sessionStorage.getItem(LITE_KEY) || "[]"); } catch { return []; }
}
function saveLiteReports(reports) {
  try { sessionStorage.setItem(LITE_KEY, JSON.stringify(reports)); } catch {}
}
function formatAge(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  return "just now";
}
function isStale(dateStr) {
  return Date.now() - new Date(dateStr).getTime() > 48 * 3600000;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SavedReports({ asset, isAuthenticated, currentResult, forecastDays, onLoad }) {
  const [open, setOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [reports, setReports] = useState([]);
  const [trashedReports, setTrashedReports] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [label, setLabel] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  // Load reports on open / auth change
  useEffect(() => {
    if (!open) return;
    fetchReports();
  }, [open, isAuthenticated]);

  async function fetchReports() {
    if (isAuthenticated) {
      try {
        const [active, trashed] = await Promise.all([
          base44.entities.AnalysisReport.filter({ asset, deleted: { $ne: true } }, "-created_date", 20),
          base44.entities.AnalysisReport.filter({ asset, deleted: true }, "-created_date", 50),
        ]);
        setReports(active);
        setTrashedReports(trashed);
      } catch { setReports([]); setTrashedReports([]); }
    } else {
      setReports(loadLiteReports().filter(r => r.asset === asset));
    }
  }

  async function handleSave() {
    if (!currentResult) return;
    setSaving(true);
    const isLiteSave = !!currentResult?.lite;
    const defaultLabel = `${isLiteSave ? "Lite" : "Pro"} · ${asset === "gold" ? "Gold" : "Silver"} · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    const rawLabel = label.trim() || defaultLabel;
    const reportLabel = isLiteSave && !rawLabel.startsWith("Lite") ? `Lite · ${rawLabel}` : rawLabel;
    const snapshot_date = new Date().toISOString();

    if (isAuthenticated) {
      try {
        setSaveError(null);
        const snapshotStr = JSON.stringify(currentResult);
        // Upload snapshot as a file to avoid entity field size limits
        const file = new File([snapshotStr], "snapshot.json", { type: "application/json" });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.AnalysisReport.create({
          asset,
          label: reportLabel,
          forecastDays,
          tier: currentResult?.lite ? "lite" : "pro",
          snapshot: file_url,
          snapshot_date,
        });
        await fetchReports();
      } catch (e) {
        console.error("SavedReports save error:", e);
        setSaveError(e?.message || "Save failed — please try again.");
      }
    } else {
      const existing = loadLiteReports();
      const newEntry = { id: Date.now().toString(), asset, label: reportLabel, forecastDays, snapshot: currentResult, snapshot_date };
      // Keep newest MAX_LITE; drop oldest if over limit
      const updated = [newEntry, ...existing.filter(r => r.asset === asset)].slice(0, MAX_LITE);
      saveLiteReports([...existing.filter(r => r.asset !== asset), ...updated]);
      setReports(updated);
    }
    setSaving(false);
    setLabel("");
    setShowSaveForm(false);
    if (!open) setOpen(true);
    else await fetchReports();
  }

  async function handleDelete(id) {
    if (isAuthenticated) {
      try { await base44.entities.AnalysisReport.update(id, { deleted: true }); } catch {}
      const moved = reports.find(x => x.id === id);
      setReports(r => r.filter(x => x.id !== id));
      if (moved) setTrashedReports(t => [{ ...moved, deleted: true }, ...t]);
    } else {
      const existing = loadLiteReports().filter(r => r.id !== id);
      saveLiteReports(existing);
      setReports(existing.filter(r => r.asset === asset));
    }
  }

  async function handleRestore(id) {
    try { await base44.entities.AnalysisReport.update(id, { deleted: false }); } catch {}
    const restored = trashedReports.find(x => x.id === id);
    setTrashedReports(t => t.filter(x => x.id !== id));
    if (restored) setReports(r => [{ ...restored, deleted: false }, ...r]);
  }

  async function handleLoad(report) {
    if (isAuthenticated) {
      try {
        // snapshot is a file URL — fetch and parse it
        const res = await fetch(report.snapshot);
        const data = await res.json();
        onLoad(data);
      } catch (e) { console.error("SavedReports load error:", e); }
    } else {
      onLoad(report.snapshot);
    }
    setOpen(false);
  }

  const canSave = !!currentResult;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-2.5 gap-2">
        <button
          onClick={() => { setOpen(v => !v); setShowTrash(false); }}
          className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Bookmark className="h-4 w-4" />
          Saved Reports
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <div className="flex items-center gap-2">
          {open && isAuthenticated && (
            <button
              onClick={() => setShowTrash(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              {showTrash ? null : <Trash2 className="h-3.5 w-3.5" />}
              {showTrash ? "← Back" : `Trash${trashedReports.length > 0 ? ` (${trashedReports.length})` : ""}`}
            </button>
          )}
          {canSave && !showTrash && (
            <button
              onClick={() => setShowSaveForm(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save current
            </button>
          )}
        </div>
      </div>

      {/* Save form */}
      {showSaveForm && (
        <div className="px-4 pb-3 border-t border-white/5 pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Label (optional)"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
        </div>
      )}

      {/* Report list */}
      {open && (
        <div className="border-t border-white/5">
          {showTrash ? (
            trashedReports.length === 0 ? (
              <p className="px-4 py-4 text-xs text-slate-600">Trash is empty.</p>
            ) : (
              <>
                <p className="px-4 pt-3 pb-1 text-xs text-slate-600">Deleted reports — restore to bring them back. They cannot be permanently deleted.</p>
                <div className="divide-y divide-white/5">
                  {trashedReports.map(r => (
                    <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 opacity-60">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400 truncate">{r.label || `${r.asset} report`}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock className="h-3 w-3 text-slate-600" />
                          <span className="text-xs text-slate-600">{formatAge(r.snapshot_date)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestore(r.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        <ArchiveRestore className="h-3 w-3" /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : reports.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-600">
              {isAuthenticated ? "No saved reports yet. Save a forecast above." : `Up to ${MAX_LITE} temporary reports per session. Sign in to save permanently.`}
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {reports.map(r => {
                const stale = isStale(r.snapshot_date);
                return (
                  <div key={r.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 truncate">{r.label || `${r.asset} report`}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="h-3 w-3 text-slate-600" />
                        <span className={`text-xs ${stale ? "text-amber-500/70" : "text-slate-600"}`}>
                          {formatAge(r.snapshot_date)}{stale ? " · may be stale" : ""}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleLoad(r)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" /> Load
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 text-slate-700 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {!isAuthenticated && (
            <p className="px-4 pb-3 text-xs text-slate-700">Reports are session-only and lost when you close this tab.</p>
          )}
        </div>
      )}
    </div>
  );
}