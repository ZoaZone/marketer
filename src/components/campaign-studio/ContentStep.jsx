import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  FileText, Wand2, Loader2, Sparkles, AlignLeft, LayoutTemplate,
  Megaphone, MessageSquare, Hash, Copy, Save, CheckCircle2, Library,
} from "lucide-react";
import { generateText } from "@/utils/aiClient";
import AssetPickerModal from "./AssetPickerModal";

const CONTENT_TYPES = [
  { id: "caption", label: "Social Caption" },
  { id: "ad_copy", label: "Ad Copy (FB/Google)" },
  { id: "video_script", label: "Video/Reel Script" },
  { id: "email", label: "Email Sequence" }
];
const FORMATS = ["Standard", "Bullet Points", "Storytelling", "Direct Response (AIDA)", "PAS Framework"];
const LENGTHS = ["Short & Punchy", "Medium (Standard)", "Long-form (In-depth)"];
const TONES = ["Professional", "Bold & Edgy", "Luxury", "Playful", "Urgent", "Educational"];

const SECONDARY_OUTPUTS = [
  { id: "video_script", label: "Video Script", Icon: FileText, type: "video_script" },
  { id: "ad_copy", label: "Ad Copy", Icon: Megaphone, type: "ad_copy" },
  { id: "caption", label: "Social Caption", Icon: MessageSquare, type: "caption" },
  { id: "hashtag_set", label: "Hashtags", Icon: Hash, type: "hashtag_set" },
];

// Maps a library ContentAsset.type back onto CampaignStudio's content_type ids
const ASSET_TYPE_TO_CONTENT_TYPE = { script: "video_script", ad_copy: "ad_copy", caption: "caption", email_template: "email" };

const inp = "w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-fuchsia-500/70 transition-all";
const lbl = "block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-2";

export default function ContentStep({ campaign, setCampaign, selectedBrand, generating, generateContent, setError }) {
  const qc = useQueryClient();
  const [loadingOutput, setLoadingOutput] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const topic = campaign.auto_mode ? campaign.campaign_name : campaign.ai_prompt;

  const generateSecondary = async (out) => {
    const t = topic.trim() || campaign.ai_output.trim();
    if (!t) { setError("Add a topic in the field above first."); return; }
    setError("");
    setLoadingOutput(out.id);
    const platform = selectedBrand?.name || "General";
    const promptMap = {
      video_script: `Write a ${platform} video script (4 scenes, label each "SCENE n:" with 1-2 short narration lines, end with a CTA) about: ${t}. Tone: ${campaign.tone}.`,
      ad_copy: `Write high-converting ${platform} ad copy for: ${t}. Tone: ${campaign.tone}. Format as HEADLINE / BODY / CTA.`,
      caption: `Write an engaging ${platform} caption with a hook, 2-3 sentences, a CTA and 5 emojis for: ${t}. Tone: ${campaign.tone}.`,
      hashtag_set: `List 20 high-reach, relevant ${platform} hashtags (space separated, each starting with #) for: ${t}.`,
    };
    try {
      const text = await generateText({ type: out.type, prompt: promptMap[out.id], platform, tone: campaign.tone });
      setCampaign(p => ({ ...p, outputs: { ...p.outputs, [out.id]: text } }));
    } catch (e) {
      setError("Generation failed: " + (e?.message || "unknown error"));
    }
    setLoadingOutput(null);
  };

  const copyOutput = async (id) => {
    await navigator.clipboard.writeText(campaign.outputs[id] || "");
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const saveOutput = async (out) => {
    if (!campaign.outputs[out.id]) return;
    try {
      await base44.entities.ContentAsset.create({
        type: out.type,
        title: `${out.label} · ${(topic || campaign.campaign_name || "Campaign").slice(0, 40)}`,
        content: campaign.outputs[out.id],
        platform: selectedBrand?.name || "General",
        ai_generated: true,
      });
      qc.invalidateQueries(["media_library"]);
      setSavedId(out.id);
      setTimeout(() => setSavedId(null), 1500);
    } catch (e) { setError("Save failed: " + (e?.message || "unknown error")); }
  };

  const handleLibrarySelect = (assets) => {
    const asset = assets[0];
    if (!asset) return;
    if (asset.type === "hashtag_set") {
      setCampaign(p => ({ ...p, outputs: { ...p.outputs, hashtag_set: asset.content || "" } }));
    } else if (asset.type === "theme") {
      setCampaign(p => ({ ...p, ai_prompt: asset.content || asset.title || "" }));
    } else {
      setCampaign(p => ({
        ...p,
        content_type: ASSET_TYPE_TO_CONTENT_TYPE[asset.type] || p.content_type,
        ai_output: asset.content || p.ai_output,
        ai_prompt: p.ai_prompt || asset.title || "",
      }));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4 space-y-6 bg-neutral-900/30 p-6 rounded-2xl border border-neutral-800/50">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-lg">Configuration</h3>
            <button onClick={() => setShowPicker(true)} className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300">
              <Library className="w-3.5 h-3.5" /> Use from Library
            </button>
          </div>

          <div>
            <label className={lbl}><FileText className="w-4 h-4" /> Content Type</label>
            <div className="grid grid-cols-1 gap-2">
              {CONTENT_TYPES.map(t => (
                <button key={t.id} onClick={() => setCampaign(p => ({ ...p, content_type: t.id }))}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border text-left ${campaign.content_type === t.id ? "bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300" : "bg-neutral-900 border-neutral-800 text-neutral-400"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div><label className={lbl}><LayoutTemplate className="w-4 h-4" /> Format</label>
            <select value={campaign.format} onChange={e => setCampaign(p => ({ ...p, format: e.target.value }))} className={inp}>
              {FORMATS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>

          <div><label className={lbl}><AlignLeft className="w-4 h-4" /> Length</label>
            <select value={campaign.length} onChange={e => setCampaign(p => ({ ...p, length: e.target.value }))} className={inp}>
              {LENGTHS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>

          <div><label className={lbl}><Sparkles className="w-4 h-4" /> Tone of Voice</label>
            <select value={campaign.tone} onChange={e => setCampaign(p => ({ ...p, tone: e.target.value }))} className={inp}>
              {TONES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="md:col-span-8 space-y-4 flex flex-col">
          <div className="flex justify-between items-end">
            <label className={lbl}>Topic / Prompt</label>
            <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer mb-2">
              <input type="checkbox" checked={campaign.auto_mode} onChange={e => setCampaign(p => ({ ...p, auto_mode: e.target.checked }))} className="rounded border-neutral-700 bg-neutral-900 text-fuchsia-500 focus:ring-fuchsia-500" />
              Auto-Pilot (AI picks topic based on brand)
            </label>
          </div>
          <textarea
            disabled={campaign.auto_mode}
            value={campaign.auto_mode ? "AI is in Auto-Pilot mode. It will analyze your brand data and industry to generate the perfect angle automatically." : campaign.ai_prompt}
            onChange={e => setCampaign(p => ({ ...p, ai_prompt: e.target.value }))}
            placeholder="What exactly are we promoting? (e.g., 'A 20% off summer sale on all leather boots')"
            rows={3}
            className={`${inp} ${campaign.auto_mode ? "opacity-50 italic" : ""}`}
          />

          <button onClick={generateContent} disabled={generating || (!campaign.ai_prompt && !campaign.auto_mode)} className="w-full py-4 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60">
            {generating ? <Loader2 className="animate-spin" /> : <Wand2 className="w-5 h-5" />} Generate Output
          </button>

          {campaign.ai_output && (
            <div className="mt-4 flex-1">
              <label className={lbl}>Generated Final Output</label>
              <textarea value={campaign.ai_output} onChange={e => setCampaign(p => ({ ...p, ai_output: e.target.value }))} className={`${inp} h-64 font-mono text-sm leading-relaxed resize-none`} />
            </div>
          )}
        </div>
      </div>

      {/* Also generate — secondary outputs (ad copy, caption, hashtags, video script) */}
      <div className="pt-6 border-t border-neutral-800">
        <h3 className="font-bold text-white mb-1">Also Generate — Global Defaults</h3>
        <p className="text-xs text-neutral-500 mb-4">Spin off extra formats from the same topic. The <strong>Hashtags</strong> and <strong>Social Caption</strong> below become the default fallback used for every platform when you Launch — to customize for one specific platform, set an override in the <strong>Repurpose</strong> step.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {SECONDARY_OUTPUTS.map(out => (
            <button key={out.id} onClick={() => generateSecondary(out)} disabled={loadingOutput === out.id}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-neutral-800 bg-neutral-900/50 text-sm font-medium text-neutral-300 hover:border-fuchsia-500/40 hover:bg-fuchsia-500/5 disabled:opacity-60 transition-all">
              {loadingOutput === out.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <out.Icon className="w-4 h-4 text-fuchsia-400" />}
              {out.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {SECONDARY_OUTPUTS.filter(out => campaign.outputs?.[out.id]).map(out => (
            <div key={out.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-white text-sm flex items-center gap-2"><out.Icon className="w-4 h-4 text-fuchsia-400" /> {out.label}</h4>
                <div className="flex gap-2">
                  <button onClick={() => copyOutput(out.id)} className={`text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 ${copiedId === out.id ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}>
                    {copiedId === out.id ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copiedId === out.id ? "Copied" : "Copy"}
                  </button>
                  <button onClick={() => saveOutput(out)} className={`text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 ${savedId === out.id ? "bg-emerald-500/10 text-emerald-400" : "bg-fuchsia-500/10 text-fuchsia-400"}`}>
                    {savedId === out.id ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}{savedId === out.id ? "Saved" : "Save"}
                  </button>
                </div>
              </div>
              <textarea value={campaign.outputs[out.id]} onChange={e => setCampaign(p => ({ ...p, outputs: { ...p.outputs, [out.id]: e.target.value } }))}
                className={`${inp} h-28 text-sm leading-relaxed resize-none`} />
              {out.id === "hashtag_set" && (
                <label className="flex items-center gap-2 mt-3 text-sm text-neutral-400 cursor-pointer">
                  <input type="checkbox" checked={campaign.include_hashtags !== false} onChange={e => setCampaign(p => ({ ...p, include_hashtags: e.target.checked }))} className="rounded border-neutral-700 bg-neutral-900 text-fuchsia-500 focus:ring-fuchsia-500" />
                  Append these hashtags to the caption when posts are published
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      <AssetPickerModal open={showPicker} onClose={() => setShowPicker(false)} types={["script", "ad_copy", "caption", "hashtag_set", "theme"]}
        multiple={false} title="Use from Library" onSelect={handleLibrarySelect} />
    </div>
  );
}
