import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Loader2, Plus, Trash2, Save, CheckCircle2, AlertCircle } from "lucide-react";

// Admin-only: choose which LLM backend the platform itself uses, either
// platform-wide or per section (capture, video, marketing, whatsapp, ...).
//
// Purpose: running generations on the platform's own OpenAI/Anthropic key
// keeps Base44 integration credits free for internal and future use. Selecting
// "Base44 built-in" restores the previous behaviour for that scope.
//
// This card only ever stores WHICH backend to use — never a key. The provider
// key itself is an env var on the backend (OPENAI_API_KEY / ANTHROPIC_API_KEY /
// CUSTOM_LLM_API_KEY), so no secret ever passes through this UI or the
// PlatformAiConfig row.

const BACKENDS = [
  { value: "platform", label: "Base44 built-in AI", hint: "Default. Spends Base44 integration credits." },
  { value: "openai", label: "OpenAI (platform key)", hint: "Uses OPENAI_API_KEY. Preserves integration credits." },
  { value: "anthropic", label: "Anthropic (platform key)", hint: "Uses ANTHROPIC_API_KEY. Preserves integration credits." },
  { value: "custom", label: "Custom / OpenAI-compatible", hint: "Uses CUSTOM_LLM_API_KEY + the base URL below." },
];

const SECTIONS = [
  { value: "capture", label: "Capture & demo videos", hint: "Server capture, Auto Demo from URL, demo narration scripts." },
  { value: "video", label: "Movie Maker / video", hint: "Film scripts, scene rewrites, translation." },
  { value: "marketing", label: "Marketing & campaigns", hint: "Captions, ad copy, campaign content, hashtags." },
  { value: "whatsapp", label: "WhatsApp replies", hint: "Knowledge-base auto-replies." },
];

export default function PlatformAiBackendCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [rowId, setRowId] = useState(null);
  const [form, setForm] = useState({
    default_backend: "platform",
    default_model: "",
    default_base_url: "",
    section_overrides: [],
  });

  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.PlatformAiConfig.list("-created_date", 5);
        const active = (rows || []).find((r) => r && r.active !== false);
        if (active) {
          setRowId(active.id);
          setForm({
            default_backend: active.default_backend || "platform",
            default_model: active.default_model || "",
            default_base_url: active.default_base_url || "",
            section_overrides: Array.isArray(active.section_overrides) ? active.section_overrides : [],
          });
        }
      } catch (_e) {
        // Entity not created yet — start from defaults.
      }
      setLoading(false);
    })();
  }, []);

  const setOverride = (index, patch) => {
    setForm((f) => {
      const next = [...f.section_overrides];
      next[index] = { ...next[index], ...patch };
      return { ...f, section_overrides: next };
    });
  };

  const addOverride = () => {
    setForm((f) => ({
      ...f,
      section_overrides: [...f.section_overrides, { section: "capture", backend: "openai", model: "", base_url: "" }],
    }));
  };

  const removeOverride = (index) => {
    setForm((f) => ({ ...f, section_overrides: f.section_overrides.filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const payload = {
        default_backend: form.default_backend,
        default_model: form.default_model.trim() || undefined,
        default_base_url: form.default_base_url.trim() || undefined,
        section_overrides: form.section_overrides
          .filter((o) => o && o.section)
          .map((o) => ({
            section: o.section,
            backend: o.backend || "platform",
            model: o.model || undefined,
            base_url: o.base_url || undefined,
          })),
        active: true,
        updated_by: (await base44.auth.me().catch(() => ({})))?.email,
      };
      if (rowId) await base44.entities.PlatformAiConfig.update(rowId, payload);
      else {
        const created = await base44.entities.PlatformAiConfig.create(payload);
        setRowId(created?.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e?.message || "Could not save the AI backend setting.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading AI backend settings…
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground flex items-center gap-2">
              AI backend (admin)
              <Badge variant="outline" className="text-[10px]">Owner only</Badge>
            </p>
            <p className="text-xs text-muted-foreground max-w-xl mt-0.5">
              Run the platform's own generations on your provider key instead of Base44's built-in AI, so integration
              credits stay reserved for internal and future use. Set it once for everything, or override it per section.
              Keys are read from backend env vars — never stored here.
            </p>
          </div>
        </div>

        {/* Platform default */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Default backend (whole platform)</label>
            <select
              value={form.default_backend}
              onChange={(e) => setForm((f) => ({ ...f, default_backend: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-fuchsia-500/50"
            >
              {BACKENDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {BACKENDS.find((b) => b.value === form.default_backend)?.hint}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Default model (optional)</label>
            <input
              value={form.default_model}
              onChange={(e) => setForm((f) => ({ ...f, default_model: e.target.value }))}
              placeholder={form.default_backend === "openai" ? "gpt-4o-mini" : form.default_backend === "anthropic" ? "claude-3-5-sonnet-20241022" : "provider default"}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50"
            />
          </div>
          {form.default_backend === "custom" && (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Custom base URL</label>
              <input
                value={form.default_base_url}
                onChange={(e) => setForm((f) => ({ ...f, default_base_url: e.target.value }))}
                placeholder="https://your-endpoint.com/v1"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50"
              />
            </div>
          )}
        </div>

        {/* Per-section overrides */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Per-section overrides</label>
            <button onClick={addOverride} className="flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
              <Plus className="w-3 h-3" /> Add override
            </button>
          </div>

          {form.section_overrides.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              None. Every section uses the default backend above.
            </p>
          )}

          {form.section_overrides.map((o, i) => (
            <div key={i} className="grid sm:grid-cols-[1.2fr_1.2fr_1fr_auto] gap-2 items-start p-2.5 rounded-lg bg-muted/40 border border-border/60">
              <div>
                <select
                  value={o.section}
                  onChange={(e) => setOverride(i, { section: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs focus:outline-none focus:border-cyan-500/50"
                >
                  {SECTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                  {SECTIONS.find((s) => s.value === o.section)?.hint}
                </p>
              </div>
              <select
                value={o.backend}
                onChange={(e) => setOverride(i, { backend: e.target.value })}
                className="px-2 py-1.5 rounded-md bg-background border border-border text-xs focus:outline-none focus:border-cyan-500/50"
              >
                {BACKENDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <input
                value={o.model || ""}
                onChange={(e) => setOverride(i, { model: e.target.value })}
                placeholder="model (optional)"
                className="px-2 py-1.5 rounded-md bg-background border border-border text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50"
              />
              <button onClick={() => removeOverride(i)} className="p-1.5 text-red-400 hover:text-red-300" title="Remove">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save AI backend
          </Button>
          {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Saved</span>}
          {error && <span className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="w-3.5 h-3.5" /> {error}</span>}
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          A user's own BYOK key (Account → Integrations) still takes priority over this setting for that user. If a
          selected provider key is missing or its call fails, generation automatically falls back to Base44's built-in AI
          rather than failing.
        </p>
      </CardContent>
    </Card>
  );
}
