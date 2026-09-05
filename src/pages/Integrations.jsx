import { useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plug, ShieldCheck, ExternalLink, Trash2, Loader2, CheckCircle2,
  AlertCircle, Eye, EyeOff, Video, Mic, Brain, KeyRound, Lock, Music,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isByokEntitled } from "@/utils/entitlements";

// Work Package F (BYOK). Replicate, ElevenLabs, and Anthropic/OpenAI do not
// support OAuth for API-key provisioning — every provider here is a
// paste-your-own-key flow, with a deep link to where the user generates one.
const LLM_KEY_URLS = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  custom: null,
};

const PROVIDERS = [
  {
    id: "replicate",
    label: "Replicate",
    icon: Video,
    description: "Powers Movie Maker Pro's per-scene AI video (Kling / MiniMax) and AI-composed music.",
    getKeyUrl: "https://replicate.com/account/api-tokens",
    placeholder: "r8_...",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    icon: Mic,
    description: "Powers Movie Maker Pro's dubbing and lip-sync.",
    getKeyUrl: "https://elevenlabs.io/app/settings/api-keys",
    placeholder: "sk_...",
  },
  {
    id: "suno",
    label: "Suno",
    icon: Music,
    description: "Optional alternative vocal-song engine for Song Creator. Vocals already work without it — ElevenLabs is the default and sings — so connect this only if you specifically want Suno. Suno has no public API of its own, so this connects a third-party Suno API provider.",
    getKeyUrl: null,
    placeholder: "your Suno API provider key...",
  },
  {
    id: "llm",
    label: "LLM (Claude / OpenAI)",
    icon: Brain,
    description: "Used for content and script generation everywhere in the app — takes priority over the platform's built-in AI when set.",
    getKeyUrl: null,
    placeholder: "sk-...",
    hasSubProvider: true,
  },
];

function ProviderRow({ provider, record }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [llmProvider, setLlmProvider] = useState(record?.llmProvider || "anthropic");
  const [llmModel, setLlmModel] = useState(record?.llmModel || "");
  const [llmBaseUrl, setLlmBaseUrl] = useState(record?.llmBaseUrl || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const connected = !!record?.masked;
  const Icon = provider.icon;
  const keyUrl = provider.hasSubProvider ? LLM_KEY_URLS[llmProvider] : provider.getKeyUrl;

  const handleSave = async () => {
    if (!apiKey.trim()) { setError("Enter a key first."); return; }
    setSaving(true);
    setError(null);
    try {
      const body = { provider: provider.id, apiKey: apiKey.trim() };
      if (provider.hasSubProvider) {
        body.llmProvider = llmProvider;
        if (llmModel.trim()) body.llmModel = llmModel.trim();
        if (llmProvider === "custom" && llmBaseUrl.trim()) body.llmBaseUrl = llmBaseUrl.trim();
      }
      const res = await base44.functions.invoke("saveApiKey", body);
      const data = res?.data ?? res;
      if (!data?.success) {
        setError(data?.error || "This key was rejected by the provider.");
        setSaving(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      setEditing(false);
      setApiKey("");
    } catch (e) {
      setError(e.message || "Failed to save key.");
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!confirm(`Remove your ${provider.label} key? Movie Maker Pro will revert to platform infrastructure for this provider.`)) return;
    setSaving(true);
    try {
      await base44.functions.invoke("removeApiKey", { provider: provider.id });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      alert("Failed to remove key: " + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground">{provider.label}</p>
            <p className="text-xs text-muted-foreground max-w-md mt-0.5">{provider.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          {connected ? (
            <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground"><AlertCircle className="w-3.5 h-3.5" /> Not connected</span>
          )}
        </div>
      </div>

      {connected && !editing && (
        <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-xl bg-muted/40 border border-border/60">
          <div className="flex items-center gap-2 text-sm">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono text-foreground">{record.masked}</span>
            {provider.hasSubProvider && record.llmProvider && (
              <span className="text-xs text-muted-foreground">· {record.llmProvider}{record.llmModel ? ` (${record.llmModel})` : ""}</span>
            )}
          </div>
          {record.verifiedAt && (
            <span className="text-[11px] text-muted-foreground">Last verified {new Date(record.verifiedAt).toLocaleString()}</span>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} className="text-xs font-semibold text-cyan-400 hover:underline">Replace</button>
            <button onClick={handleRemove} disabled={saving} className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:underline disabled:opacity-50">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        </div>
      )}

      {(!connected || editing) && (
        <div className="space-y-3">
          {provider.hasSubProvider && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Provider</label>
                <select
                  value={llmProvider}
                  onChange={e => setLlmProvider(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">Custom / OpenAI-compatible</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Model (optional)</label>
                <input
                  value={llmModel}
                  onChange={e => setLlmModel(e.target.value)}
                  placeholder={llmProvider === "anthropic" ? "claude-3-5-sonnet-20241022" : llmProvider === "openai" ? "gpt-4o-mini" : "model name"}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              {llmProvider === "custom" && (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Base URL</label>
                  <input
                    value={llmBaseUrl}
                    onChange={e => setLlmBaseUrl(e.target.value)}
                    placeholder="https://your-endpoint.com/v1"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={show ? "text" : "password"}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={provider.placeholder}
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50"
              />
              <button onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
            {editing && (
              <button onClick={() => { setEditing(false); setApiKey(""); setError(null); }} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Cancel</button>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            {keyUrl ? (
              <a href={keyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
                Get your key <ExternalLink className="w-3 h-3" />
              </a>
            ) : <span />}
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Integrations() {
  const { user, subscription, isAdmin } = useOutletContext() || {};
  const apiKeys = user?.settings?.api_keys || {};
  const entitled = isAdmin || isByokEntitled(subscription);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Plug className="w-6 h-6 text-cyan-400" /> Integrations
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Connect your own AI provider accounts (bring-your-own-key).</p>
      </div>

      <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">BYOK keys are used for Movie Maker Pro (Lane 2) AI generation only.</strong> Business / Quick
          Create features run on platform infrastructure and are unaffected by anything on this page. Keys are encrypted at rest, never
          shown in full after saving, and validated against the provider before being stored.
        </p>
      </div>

      {entitled ? (
        <div className="space-y-4">
          {PROVIDERS.map(p => (
            <ProviderRow key={p.id} provider={p} record={apiKeys[p.id]} />
          ))}
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
          <Lock className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-semibold text-foreground">BYOK requires a BYOK or Movie Maker Pro subscription</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Connecting your own Replicate, ElevenLabs, or LLM key is available on the $49/mo BYOK add-on, or any Movie Maker Pro
            (Lane 2) plan — Indie, Studio, Dubbing House, or Enterprise.
          </p>
          <Link to="/pricing" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-cyan-400 hover:underline">View plans →</Link>
        </div>
      )}
    </div>
  );
}
