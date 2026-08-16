import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, Pencil, Check, X } from "lucide-react";

const DIR_STYLE = {
  bullish: { icon: TrendingUp, color: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  bearish: { icon: TrendingDown, color: "text-rose-400", badge: "bg-rose-500/10 text-rose-300 border-rose-500/20" },
  neutral: { icon: Minus, color: "text-slate-400", badge: "bg-slate-500/10 text-slate-300 border-slate-500/20" },
};

const EMPTY = {
  title: "",
  description: "",
  asset: "silver",
  pressureImpact: 0,
  direction: "bullish",
  isActive: true,
  startDate: "",
  expectedDecayDate: "",
};

export default function StructuralDriversPanel({ asset = "silver" }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDrivers();
  }, []);

  async function fetchDrivers() {
    setLoading(true);
    try {
      const all = await base44.entities.StructuralDriver.list("-created_date");
      setDrivers(all);
    } finally {
      setLoading(false);
    }
  }

  function startAdd() {
    setForm({ ...EMPTY, asset });
    setAdding(true);
    setEditingId(null);
  }

  function startEdit(driver) {
    setForm({ ...driver });
    setEditingId(driver.id);
    setAdding(false);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY);
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        pressureImpact: parseFloat(form.pressureImpact) || 0,
      };
      if (editingId) {
        await base44.entities.StructuralDriver.update(editingId, payload);
      } else {
        await base44.entities.StructuralDriver.create(payload);
      }
      await fetchDrivers();
      cancelForm();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(driver) {
    await base44.entities.StructuralDriver.update(driver.id, { isActive: !driver.isActive });
    setDrivers(ds => ds.map(d => d.id === driver.id ? { ...d, isActive: !d.isActive } : d));
  }

  async function remove(id) {
    await base44.entities.StructuralDriver.delete(id);
    setDrivers(ds => ds.filter(d => d.id !== id));
  }

  const totalPressure = drivers
    .filter(d => d.isActive && (d.asset === "both" || d.asset === asset))
    .reduce((s, d) => s + (d.pressureImpact ?? 0), 0);

  const isFormOpen = adding || editingId != null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">
            Active structural pressure on <span className="capitalize font-medium text-slate-400">{asset}</span> drift:{" "}
            <span className={`font-mono font-semibold ${totalPressure >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {totalPressure >= 0 ? "+" : ""}{(totalPressure * 100).toFixed(2)}%/yr
            </span>
          </p>
        </div>
        {!isFormOpen && (
          <Button size="sm" onClick={startAdd} className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Driver
          </Button>
        )}
      </div>

      {/* Add/Edit Form */}
      {isFormOpen && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-amber-300">{editingId ? "Edit" : "New"} Structural Driver</p>
          <div className="grid grid-cols-1 gap-2">
            <input
              placeholder="Title (e.g. Fed Rate Pivot Cycle, Supply Constraint 2025)"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
            />
            <textarea
              placeholder="Why is this pressure still relevant? (optional)"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-400/40 resize-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Asset</label>
                <select
                  value={form.asset}
                  onChange={e => setForm(f => ({ ...f, asset: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 focus:outline-none"
                >
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Direction</label>
                <select
                  value={form.direction}
                  onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 focus:outline-none"
                >
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">
                  Drift adj. (%/yr)
                  <span className="ml-1 text-slate-600">(e.g. 3 or -2)</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="e.g. 3"
                  value={form.pressureImpact * 100 || ""}
                  onChange={e => setForm(f => ({ ...f, pressureImpact: parseFloat(e.target.value) / 100 || 0 }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Start date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Expected decay (optional)</label>
                <input
                  type="date"
                  value={form.expectedDecayDate}
                  onChange={e => setForm(f => ({ ...f, expectedDecayDate: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || !form.title.trim()} className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30">
              <Check className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelForm} className="border-slate-500/30 text-slate-400">
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Driver list */}
      {loading ? (
        <p className="text-xs text-slate-600 py-4 text-center">Loading drivers…</p>
      ) : drivers.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center space-y-1">
          <p className="text-sm text-slate-500">No structural drivers defined.</p>
          <p className="text-xs text-slate-600">Add long-term pressures to adjust the forecast drift.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {drivers.map(d => {
            const { icon: Icon, color, badge } = DIR_STYLE[d.direction] ?? DIR_STYLE.neutral;
            const relevant = d.asset === "both" || d.asset === asset;
            return (
              <div
                key={d.id}
                className={`rounded-xl border bg-white/[0.02] px-4 py-3 flex items-start gap-3 transition-opacity ${
                  d.isActive && relevant ? "border-white/10 opacity-100" : "border-white/5 opacity-50"
                }`}
              >
                <button
                  onClick={() => toggleActive(d)}
                  title={d.isActive ? "Click to deactivate" : "Click to activate"}
                  className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${
                    d.isActive ? "border-amber-400 bg-amber-400" : "border-slate-600 bg-transparent"
                  }`}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge}`}>
                      <Icon className={`h-3 w-3 ${color}`} />
                      {d.direction}
                    </span>
                    <span className="text-sm font-medium text-slate-200 truncate">{d.title}</span>
                    {!relevant && (
                      <span className="text-xs text-slate-600 italic">({d.asset} only)</span>
                    )}
                  </div>
                  {d.description && (
                    <p className="text-xs text-slate-500 leading-relaxed">{d.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className={`font-mono font-semibold ${d.pressureImpact >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {d.pressureImpact >= 0 ? "+" : ""}{((d.pressureImpact ?? 0) * 100).toFixed(2)}%/yr drift adj.
                    </span>
                    {d.startDate && <span>Since {new Date(d.startDate + "T12:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>}
                    {d.expectedDecayDate && <span>· Fades ~{new Date(d.expectedDecayDate + "T12:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(d)} className="text-slate-600 hover:text-slate-300 transition-colors p-1">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(d.id)} className="text-slate-600 hover:text-rose-400 transition-colors p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-700">
        Active drivers are permanently injected into the forecast drift — independent of the news ribbon.
      </p>
    </div>
  );
}