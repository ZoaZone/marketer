// The website URL / product description entered in Create Demo, shared with
// Pitch Deck so both tools work from the same input.
const KEY = "ds_demo_source_v1";

export function saveDemoSource(source) {
  try { localStorage.setItem(KEY, JSON.stringify(source)); } catch { /* storage unavailable */ }
}

export function loadDemoSource() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}