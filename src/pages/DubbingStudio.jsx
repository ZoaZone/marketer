import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { uploadFile, probeMediaDuration } from "@/utils/lane2";
import {
  Languages, Upload, Loader2, Plus, Trash2, Play, RefreshCw, Download,
  Users, BookMarked, Music2, Lock, AlertTriangle, CheckCircle2, Clock, FileVideo,
} from "lucide-react";

// Dubbing Studio — the commercial dubbing workspace.
//
// One DubbingProject = one source dubbed into many target languages. The
// browser is deliberately NOT the thing tracking progress: submitDubbingProject
// registers every language's job server-side and syncDubbingProject reconciles
// them onto the project row, so a feature-length batch survives this tab being
// closed. Everything below is a view over that row.
//
// Tier gate here is UX only; submitDubbingProject enforces it with a 403.
const DUB_MIN_TIER = 4; // AppLayout TIER_MAP: 4 = studio / dubbing_house / enterprise / byok

// A working shortlist rather than an exhaustive one — these are the languages
// the dubbing market actually asks for, with Indian languages up front given
// where this product sells.
const LANGUAGES = [
  { code: "hi", label: "Hindi" }, { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" }, { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" }, { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" }, { code: "gu", label: "Gujarati" },
  { code: "pa", label: "Punjabi" }, { code: "ur", label: "Urdu" },
  { code: "en", label: "English" }, { code: "es", label: "Spanish" },
  { code: "fr", label: "French" }, { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" }, { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" }, { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" }, { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" }, { code: "id", label: "Indonesian" },
];

const langLabel = (code) => LANGUAGES.find((l) => l.code === code)?.label || code;

function fmtDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown length";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

const STATUS_STYLE = {
  done: "bg-emerald-500/15 text-emerald-400",
  processing: "bg-fuchsia-500/15 text-fuchsia-400",
  queued: "bg-amber-500/15 text-amber-400",
  failed: "bg-red-500/15 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  review: "bg-sky-500/15 text-sky-400",
};

function StatusChip({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[status] || STATUS_STYLE.pending}`}>
      {status}
    </span>
  );
}

const card = "rounded-2xl border border-border bg-card p-5";
const inp = "w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-foreground focus:outline-none focus:border-fuchsia-500/60";
const btnPrimary = "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnGhost = "flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted/20 transition-colors";

export default function DubbingStudio() {
  const qc = useQueryClient();
  const { user, userTier = 0, isAdmin = false } = useOutletContext() || {};
  const entitled = isAdmin || userTier >= DUB_MIN_TIER;

  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [draft, setDraft] = useState({
    title: "",
    source_url: "",
    source_filename: "",
    source_kind: "video",
    source_seconds: 0,
    source_lang: "",
    target_langs: [],
    num_speakers: 0,
    preserve_background_audio: true,
    voice_cloning: true,
    lip_sync: false,
    burn_captions: false,
    highest_resolution: true,
    speaker_map: [],
    glossary: [],
  });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["dubbing_projects", user?.email],
    queryFn: () => base44.entities.DubbingProject.filter({ owner_email: user?.email }, "-created_date", 50),
    enabled: !!user?.email,
    // A running batch changes state on the server, not here. Poll while
    // anything is live so the operator sees movement without refreshing.
    refetchInterval: (data) =>
      (data || []).some((p) => ["queued", "processing"].includes(p.status)) ? 20000 : false,
  });

  const selected = projects.find((p) => p.id === selectedId) || null;

  const invoke = async (name, body) => {
    const res = await base44.functions.invoke(name, body);
    const data = res?.data ?? res;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setBusy("upload"); setError("");
    try {
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload failed.");
      const kind = file.type.startsWith("audio") ? "audio" : "video";
      // Duration is load-bearing, not decoration: it sets the poll-timeout
      // budget on both the client and the worker, and drives the cost estimate.
      const seconds = await probeMediaDuration(url, kind);
      setDraft((d) => ({
        ...d,
        source_url: url,
        source_filename: file.name,
        source_kind: kind,
        source_seconds: seconds || 0,
        title: d.title || file.name.replace(/\.[^.]+$/, ""),
      }));
    } catch (e) {
      setError(e?.message || "Upload failed.");
    }
    setBusy("");
  };

  const toggleLang = (code) =>
    setDraft((d) => ({
      ...d,
      target_langs: d.target_langs.includes(code)
        ? d.target_langs.filter((c) => c !== code)
        : [...d.target_langs, code],
    }));

  const createAndRun = async () => {
    if (!draft.source_url) { setError("Upload a source file first."); return; }
    if (!draft.target_langs.length) { setError("Choose at least one target language."); return; }
    setBusy("submit"); setError("");
    try {
      const project = await base44.entities.DubbingProject.create({
        ...draft,
        owner_email: user?.email,
        title: draft.title || draft.source_filename || "Untitled dub",
        status: "draft",
        // Drop empty rows so the provider isn't sent half-filled entries.
        glossary: draft.glossary.filter((g) => g.term?.trim()),
        speaker_map: draft.speaker_map.filter((s) => s.speaker_label?.trim()),
      });
      const res = await invoke("submitDubbingProject", { project_id: project.id });
      setSelectedId(project.id);
      if (!res?.estimate_available) {
        // Say why there's no number rather than showing nothing and letting the
        // operator assume the run is free.
        setError("Submitted. Cost estimates are unavailable — DUBBING_RATE_USD_PER_MINUTE is not configured on the app.");
      }
      qc.invalidateQueries({ queryKey: ["dubbing_projects"] });
    } catch (e) {
      setError(e?.message || "Could not start the dub.");
    }
    setBusy("");
  };

  const sync = async (projectId) => {
    setBusy(`sync:${projectId}`);
    try {
      await invoke("syncDubbingProject", { project_id: projectId });
      qc.invalidateQueries({ queryKey: ["dubbing_projects"] });
    } catch (e) {
      setError(e?.message || "Could not refresh status.");
    }
    setBusy("");
  };

  // ── Gate ──────────────────────────────────────────────────────────────────
  if (!entitled) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-fuchsia-500/15 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-fuchsia-400" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Dubbing Studio</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Dub a full feature into any language while keeping each speaker&apos;s voice, the
          original music bed, and your locked terminology. Available on Studio,
          Dubbing House and Enterprise plans.
        </p>
        <Link to="/pricing" className={`${btnPrimary} w-fit mx-auto`}>View plans</Link>
      </div>
    );
  }

  const estMinutes = draft.source_seconds / 60;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Languages className="w-6 h-6 text-fuchsia-400" /> Dubbing Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One source, many languages — voice, tone and background music preserved.
          </p>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ── New project ──────────────────────────────────────────────── */}
        <div className="space-y-5">
          <section className={card}>
            <h2 className="font-semibold text-foreground mb-4">New dubbing project</h2>

            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Source file</label>
            {draft.source_url ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                <FileVideo className="w-5 h-5 text-fuchsia-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{draft.source_filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {draft.source_kind} · {fmtDuration(draft.source_seconds)}
                    {!draft.source_seconds && " — length couldn't be read; timeouts will use the long-form default"}
                  </p>
                </div>
                <button onClick={() => setDraft((d) => ({ ...d, source_url: "", source_filename: "", source_seconds: 0 }))}
                  className="text-muted-foreground hover:text-red-400" aria-label="Remove source">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-border hover:border-fuchsia-500/40 cursor-pointer transition-colors">
                {busy === "upload"
                  ? <Loader2 className="w-5 h-5 animate-spin text-fuchsia-400" />
                  : <Upload className="w-5 h-5 text-muted-foreground" />}
                <span className="text-sm text-muted-foreground">
                  {busy === "upload" ? "Uploading…" : "Upload the film or audio track"}
                </span>
                <input type="file" accept="video/*,audio/*" className="hidden"
                  onChange={(e) => handleUpload(e.target.files?.[0])} disabled={busy === "upload"} />
              </label>
            )}

            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Project title</label>
                <input className={inp} value={draft.title} placeholder="Feature A — South India"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Source language</label>
                <select className={inp} value={draft.source_lang}
                  onChange={(e) => setDraft((d) => ({ ...d, source_lang: e.target.value }))}>
                  <option value="">Auto-detect</option>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Target languages {draft.target_langs.length > 0 && `(${draft.target_langs.length})`}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.map((l) => {
                  const on = draft.target_langs.includes(l.code);
                  return (
                    <button key={l.code} type="button" onClick={() => toggleLang(l.code)} aria-pressed={on}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        on ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400"
                           : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                      {l.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Each language is billed and rendered separately.
              </p>
            </div>
          </section>

          {/* ── Fidelity options ───────────────────────────────────────── */}
          <section className={card}>
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Music2 className="w-4 h-4 text-fuchsia-400" /> Fidelity
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              The defaults are what commercial delivery normally wants.
            </p>
            <div className="space-y-2.5">
              {[
                { k: "voice_cloning", label: "Keep each speaker's voice and tone", hint: "Carries the original performance into the target language." },
                { k: "preserve_background_audio", label: "Keep the original music and effects", hint: "Dialogue is replaced; the score and ambience stay under it." },
                { k: "highest_resolution", label: "Highest output quality", hint: "Slower, larger files — the norm for delivery masters." },
                { k: "lip_sync", label: "Re-sync lip movement", hint: "Video only. Adds a separate paid pass and significant time.", videoOnly: true },
                { k: "burn_captions", label: "Burn captions into the picture", hint: "Otherwise a separate .srt is produced alongside.", videoOnly: true },
              ].map(({ k, label, hint, videoOnly }) => {
                const disabled = videoOnly && draft.source_kind !== "video";
                return (
                  <label key={k} className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${disabled ? "opacity-40" : "hover:bg-muted/20 cursor-pointer"}`}>
                    <input type="checkbox" checked={!!draft[k]} disabled={disabled}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.checked }))}
                      className="mt-0.5 accent-fuchsia-500" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{label}</span>
                      <span className="block text-[11px] text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 max-w-[200px]">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Speakers</label>
              <input type="number" min="0" max="30" className={inp} value={draft.num_speakers || ""}
                placeholder="Auto-detect"
                onChange={(e) => setDraft((d) => ({ ...d, num_speakers: Number(e.target.value) || 0 }))} />
            </div>
          </section>

          {/* ── Glossary ───────────────────────────────────────────────── */}
          <section className={card}>
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-fuchsia-400" /> Locked terminology
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Names, brands and domain terms that must render the same way in every reel.
              Applied as translation guidance on every language in this project.
            </p>
            <div className="space-y-2">
              {draft.glossary.map((g, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={inp} placeholder="Term in source" value={g.term || ""}
                    onChange={(e) => setDraft((d) => {
                      const next = [...d.glossary]; next[i] = { ...next[i], term: e.target.value }; return { ...d, glossary: next };
                    })} />
                  <input className={inp} placeholder={g.do_not_translate ? "— left as-is —" : "Required translation"}
                    value={g.translation || ""} disabled={g.do_not_translate}
                    onChange={(e) => setDraft((d) => {
                      const next = [...d.glossary]; next[i] = { ...next[i], translation: e.target.value }; return { ...d, glossary: next };
                    })} />
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={!!g.do_not_translate} className="accent-fuchsia-500"
                      onChange={(e) => setDraft((d) => {
                        const next = [...d.glossary]; next[i] = { ...next[i], do_not_translate: e.target.checked }; return { ...d, glossary: next };
                      })} />
                    Keep
                  </label>
                  <button onClick={() => setDraft((d) => ({ ...d, glossary: d.glossary.filter((_, x) => x !== i) }))}
                    className="text-muted-foreground hover:text-red-400 flex-shrink-0" aria-label="Remove term">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setDraft((d) => ({ ...d, glossary: [...d.glossary, { term: "", translation: "", do_not_translate: false }] }))}
              className={`${btnGhost} mt-3`}>
              <Plus className="w-3.5 h-3.5" /> Add term
            </button>
          </section>

          {/* ── Speaker casting ────────────────────────────────────────── */}
          <section className={card}>
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Users className="w-4 h-4 text-fuchsia-400" /> Speaker casting
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Optional. Pin a specific target-language voice to a detected speaker instead of
              accepting the automatic assignment. Speaker labels come back on the first run —
              leave this empty for the first pass, then cast and re-run.
            </p>
            <div className="space-y-2">
              {draft.speaker_map.map((s, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={inp} placeholder="speaker_0" value={s.speaker_label || ""}
                    onChange={(e) => setDraft((d) => {
                      const next = [...d.speaker_map]; next[i] = { ...next[i], speaker_label: e.target.value }; return { ...d, speaker_map: next };
                    })} />
                  <input className={inp} placeholder="Character" value={s.character_name || ""}
                    onChange={(e) => setDraft((d) => {
                      const next = [...d.speaker_map]; next[i] = { ...next[i], character_name: e.target.value }; return { ...d, speaker_map: next };
                    })} />
                  <input className={inp} placeholder="Voice ID" value={s.voice_id || ""}
                    onChange={(e) => setDraft((d) => {
                      const next = [...d.speaker_map]; next[i] = { ...next[i], voice_id: e.target.value }; return { ...d, speaker_map: next };
                    })} />
                  <button onClick={() => setDraft((d) => ({ ...d, speaker_map: d.speaker_map.filter((_, x) => x !== i) }))}
                    className="text-muted-foreground hover:text-red-400 flex-shrink-0" aria-label="Remove speaker">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setDraft((d) => ({ ...d, speaker_map: [...d.speaker_map, { speaker_label: "", character_name: "", voice_id: "" }] }))}
              className={`${btnGhost} mt-3`}>
              <Plus className="w-3.5 h-3.5" /> Add speaker
            </button>
          </section>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={createAndRun} disabled={busy === "submit" || !draft.source_url || !draft.target_langs.length}
              className={btnPrimary}>
              {busy === "submit"
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
                : <><Play className="w-4 h-4" /> Start dubbing {draft.target_langs.length > 0 && `(${draft.target_langs.length} language${draft.target_langs.length > 1 ? "s" : ""})`}</>}
            </button>
            {draft.source_seconds > 0 && draft.target_langs.length > 0 && (
              <p className="text-xs text-muted-foreground">
                ≈ {Math.round(estMinutes * draft.target_langs.length)} source-minutes billed
                {draft.lip_sync && " · lip-sync adds a second pass"}
              </p>
            )}
          </div>
        </div>

        {/* ── Projects list ────────────────────────────────────────────── */}
        <aside className="space-y-3 lg:sticky lg:top-4">
          <h2 className="font-semibold text-foreground text-sm">Your projects</h2>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && !projects.length && (
            <p className="text-sm text-muted-foreground">Nothing dubbed yet.</p>
          )}
          {projects.map((p) => {
            const outs = Array.isArray(p.outputs) ? p.outputs : [];
            const done = outs.filter((o) => o.status === "done").length;
            const isOpen = selectedId === p.id;
            return (
              <div key={p.id} className={`rounded-xl border p-3 transition-colors ${isOpen ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-border"}`}>
                <button onClick={() => setSelectedId(isOpen ? null : p.id)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{p.title || "Untitled"}</span>
                    <StatusChip status={p.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {outs.length ? `${done}/${outs.length} languages ready` : "not started"}
                    {p.source_seconds ? ` · ${fmtDuration(p.source_seconds)}` : ""}
                  </p>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {typeof p.estimated_cost_usd === "number" && (
                      <p className="text-[11px] text-muted-foreground">
                        Estimated cost: <span className="font-semibold text-foreground">${p.estimated_cost_usd.toFixed(2)}</span>
                      </p>
                    )}
                    {outs.map((o) => (
                      <div key={o.target_lang} className="flex items-center gap-2 text-xs">
                        {o.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                        {["queued", "processing"].includes(o.status) && <Clock className="w-3.5 h-3.5 text-fuchsia-400 flex-shrink-0" />}
                        {o.status === "failed" && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                        <span className="flex-1 truncate text-foreground">{langLabel(o.target_lang)}</span>
                        {o.status === "processing" && typeof o.progress === "number" && (
                          <span className="text-muted-foreground tabular-nums">{Math.round(o.progress * 100)}%</span>
                        )}
                        {o.url && (
                          <a href={o.url} target="_blank" rel="noreferrer" className="text-fuchsia-400 hover:underline flex items-center gap-1">
                            <Download className="w-3 h-3" /> file
                          </a>
                        )}
                        {o.captions_url && (
                          <a href={o.captions_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">srt</a>
                        )}
                      </div>
                    ))}
                    {outs.some((o) => o.error) && (
                      <p className="text-[11px] text-red-400">
                        {outs.find((o) => o.error)?.error}
                      </p>
                    )}
                    <button onClick={() => sync(p.id)} disabled={busy === `sync:${p.id}`} className={`${btnGhost} w-full justify-center mt-1`}>
                      {busy === `sync:${p.id}`
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      Refresh status
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
