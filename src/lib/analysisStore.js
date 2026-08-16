// Module-level analysis store — survives component unmounts so analysis continues
// even when user navigates to EventDetail and comes back.
// Persists to localStorage keyed by asset so analyses survive full page reloads.

const STORAGE_KEY = "argensci_event_analyses";

function loadFromStorage(asset) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return all[asset] ?? {};
  } catch { return {}; }
}

function saveToStorage(asset, analyses) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    all[asset] = analyses;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

// Seed from localStorage using the last active asset
const _seedAsset = (() => { try { return sessionStorage.getItem("argensci_active_asset") || "silver"; } catch { return "silver"; } })();

export const analysisStore = {
  currentAsset: _seedAsset,
  analyses: loadFromStorage(_seedAsset),
  listeners: new Set(),
  analyzingListeners: new Set(),
  isAnalyzing: false,
  isCancelled: false,
  eventAborts: {}, // key -> AbortController

  notify() {
    this.listeners.forEach((fn) => fn({ ...this.analyses }));
  },

  notifyAnalyzing(val) {
    this.isAnalyzing = val;
    this.analyzingListeners.forEach((fn) => fn(val));
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  subscribeAnalyzing(fn) {
    this.analyzingListeners.add(fn);
    return () => this.analyzingListeners.delete(fn);
  },

  setAsset(asset) {
    const changed = this.currentAsset !== asset;
    this.currentAsset = asset;
    this.analyses = loadFromStorage(asset);
    try { sessionStorage.setItem("argensci_active_asset", asset); } catch {}
    if (changed) this.notify();
  },

  set(key, value) {
    this.analyses[key] = value;
    this.notify();
    // Persist to localStorage under current asset
    saveToStorage(this.currentAsset, this.analyses);
    // Also update per-event key so EventDetail's poller picks it up
    try {
      const eventKey = `silver_event_${value.event_date}_${value.event_type}`;
      const existing = sessionStorage.getItem(eventKey);
      const parsed = existing ? JSON.parse(existing) : {};
      sessionStorage.setItem(eventKey, JSON.stringify({ ...parsed, analysis: value }));
    } catch {}
  },

  // Clear completed analyses for keys no longer in the event list — preserves in-flight ones
  pruneToEvents(eventKeys) {
    const keySet = new Set(eventKeys);
    const pruned = {};
    Object.keys(this.analyses).forEach((k) => {
      // Always keep if still in current event set, or if still loading (in-flight)
      if (keySet.has(k) || this.analyses[k]?._loading) pruned[k] = this.analyses[k];
    });
    this.analyses = pruned;
    saveToStorage(this.currentAsset, pruned);
    this.notify();
  },

  reset() {
    this.analyses = {};
    saveToStorage(this.currentAsset, {});
    this.notify();
  },
};