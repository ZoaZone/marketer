import { useState, useRef, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import {
  Building2, FileText, Image as ImageIcon, Calendar, Check, X,
  Share2, Sparkles, CheckCircle2, PlayCircle, AlertTriangle, Eye, Layers,
} from "lucide-react";
// Lane 1 (Business/Marketing) page — imports only from @/utils/lane1,
// never @/utils/lane2 or aiClient.js's paid-generation exports directly
// (enforced by eslint.config.js's lane guard).
import { generateText, generateImage, uploadFile, generateVoiceover, splitScriptIntoScenes, assembleLane1Video } from "@/utils/lane1";
import { compositeLogo } from "@/utils/videoAssembler";
import { computeOccurrenceDates } from "@/utils/recurrence";
import { verifyOneAccount, verifyAccounts, isAuthorizedStatus } from "@/utils/socialAccountStatus";
import { PLATFORM_META } from "@/components/campaign-studio/platformMeta";
import BrandStep from "@/components/campaign-studio/BrandStep";
import AccountsStep from "@/components/campaign-studio/AccountsStep";
import ContentStep from "@/components/campaign-studio/ContentStep";
import MediaStep from "@/components/campaign-studio/MediaStep";
import RepurposeStep from "@/components/campaign-studio/RepurposeStep";
import PreviewStep from "@/components/campaign-studio/PreviewStep";
import TimelineStep from "@/components/campaign-studio/TimelineStep";
import LaunchStep from "@/components/campaign-studio/LaunchStep";

const STEPS = [
  { id: "brand", label: "Brand", icon: Building2 },
  { id: "accounts", label: "Accounts", icon: Share2 },
  { id: "content", label: "Copy & Scripts", icon: FileText },
  { id: "media", label: "Media & Clips", icon: ImageIcon },
  { id: "repurpose", label: "Repurpose", icon: Layers },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "schedule", label: "Timeline", icon: Calendar },
  { id: "review", label: "Launch", icon: CheckCircle2 }
];

// CampaignStudio's content types -> ContentAsset.type enum (they don't match 1:1)
const CONTENT_TYPE_TO_ASSET_TYPE = {
  caption: "caption",
  ad_copy: "ad_copy",
  video_script: "script",
  email: "email_template",
};

// Platforms ScheduledPost.platform actually accepts (whatsapp/email accounts
// are valid SocialAccounts but go through Social Hub's bulk-send tools instead)
const SCHEDULABLE_PLATFORMS = new Set(["instagram", "facebook", "tiktok", "linkedin", "youtube", "twitter_x", "pinterest"]);

const WALKTHROUGH_STEPS = [
  { icon: Building2, title: "1. Brand", desc: "Pick which brand this campaign represents — its name, voice and colors feed everything else." },
  { icon: Share2, title: "2. Accounts", desc: "Choose which connected social accounts this campaign should publish to." },
  { icon: FileText, title: "3. Copy & Scripts", desc: "Generate AI copy for your chosen content type, spin off extra formats (ad copy, captions, hashtags, video scripts), or pull a saved asset from your library." },
  { icon: ImageIcon, title: "4. Media & Clips", desc: "Upload, generate, or browse your library for images and video, fine-tune each clip's length, then compile a captioned vertical video." },
  { icon: Layers, title: "5. Repurpose", desc: "Optionally resize your video and generate platform-specific hashtags, descriptions and thumbnails for each connected channel." },
  { icon: Eye, title: "6. Preview", desc: "Review exactly what will be posted — accounts, copy, hashtags, media and schedule — before you launch." },
  { icon: Calendar, title: "7. Timeline", desc: "Post immediately (the default), schedule one or more dates/times, or turn on Repeat for an ongoing campaign — Studio auto-generates fresh, on-brand content for every recurrence." },
  { icon: CheckCircle2, title: "8. Launch", desc: "Review everything and deploy — you'll get a result for each account." },
];

const isImageUrl = (u = "") => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || u.startsWith("blob:") || u.startsWith("data:image");

export default function CampaignStudio() {
  const navigate = useNavigate();
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const mediaRef = useRef();
  const musicRef = useRef();

  const [step, setStep] = useState(0);
  const [showDemo, setShowDemo] = useState(false);
  const [campaign, setCampaign] = useState({
    brand_id: "", campaign_name: "", launch_date: "",
    content_type: "caption", format: "Standard", length: "Medium (Standard)", tone: "Professional",
    ai_prompt: "", ai_output: "", auto_mode: false,
    outputs: {}, include_hashtags: true,
    selected_accounts: [], media_urls: [], video_url: "",
    clip_durations: [], video_narration: "",
    video_settings: { music: "Trending TikTok", voice: "AI Female (Natural)", mood: "Energetic", musicUrl: "", musicName: "", subtitleStyle: "bottom" },
    schedules: [{ date: "", time: "09:00", topic: "" }],
    postNow: true,
    repeat: { enabled: false, cadence: "weekly", months: 3 },
    platform_overrides: {},
  });

  const [generating, setGenerating] = useState(false);
  const [generatingMedia, setGeneratingMedia] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [repurposing, setRepurposing] = useState({});
  const [generatingCopyFor, setGeneratingCopyFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [publishReport, setPublishReport] = useState([]);
  const [publishStatus, setPublishStatus] = useState("");
  const [warnings, setWarnings] = useState([]);

  const { data: brands = [] } = useQuery({ queryKey: ["brands", user?.email], queryFn: () => base44.entities.Brand.filter(mine(user), "-created_date", 20), enabled: !!user?.email });
  const { data: allAccounts = [] } = useQuery({ queryKey: ["social_accounts", user?.email], queryFn: () => base44.entities.SocialAccount.filter(mine(user), "-created_date", 100), enabled: !!user?.email });

  // Prefill / media import handoff from other pages (kept from original, now safe-guarded)
  useEffect(() => {
    try {
      const prefill = sessionStorage.getItem("campaignStudio_prefill");
      if (prefill) {
        const data = JSON.parse(prefill);
        setCampaign(p => ({ ...p, ...data }));
        if (data.ai_output) setStep(2);
        sessionStorage.removeItem("campaignStudio_prefill");
      }
    } catch (e) { console.error("Prefill error:", e); }

    try {
      const mediaImport = sessionStorage.getItem("mediaImportData");
      if (mediaImport) {
        const urls = JSON.parse(mediaImport);
        setCampaign(p => ({ ...p, media_urls: [...new Set([...p.media_urls, ...urls])] }));
        setStep(3);
        sessionStorage.removeItem("mediaImportData");
      }
    } catch (err) { console.error("Media import error:", err); }
  }, []);

  const selectedBrand = brands.find(b => b.id === campaign.brand_id);
  const brandAccounts = allAccounts.filter(a => a.brand_id === campaign.brand_id);

  // Real connection status per account, keyed by id — `status` on the entity
  // itself is stale until someone re-tests it (see socialAccountStatus.js),
  // so the Accounts step badge and publish gating both read from this
  // instead of trusting the stored field. Verifies each newly-seen account
  // exactly once per load: ids already present here (including a "checking"
  // placeholder) are skipped on subsequent effect runs.
  const [verifiedStatus, setVerifiedStatus] = useState({});
  useEffect(() => {
    const unverified = allAccounts.filter(a => !(a.id in verifiedStatus));
    if (!unverified.length) return;
    setVerifiedStatus(prev => {
      const next = { ...prev };
      unverified.forEach(a => { next[a.id] = { status: "checking", message: "", verified: false }; });
      return next;
    });
    let cancelled = false;
    verifyAccounts(unverified, (id, result) => {
      if (!cancelled) setVerifiedStatus(prev => ({ ...prev, [id]: result }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAccounts]);

  // ── Real AI content generation (was a raw fetch to /api/functions) ──
  const generateContent = async () => {
    if (!campaign.ai_prompt.trim() && !campaign.auto_mode) return;
    setError("");
    setGenerating(true);
    const brandContext = selectedBrand ? `Brand: ${selectedBrand.name}. Industry: ${selectedBrand.industry || "General"}. Voice: ${selectedBrand.brand_voice || campaign.tone}.` : "";
    const topic = campaign.auto_mode
      ? "Auto-generate an engaging topic based on the brand context above."
      : campaign.ai_prompt;
    const prompt = `${brandContext}
Write a ${campaign.length} ${campaign.content_type.replace(/_/g, " ")} in a ${campaign.tone} tone, formatted as ${campaign.format}.
Topic: ${topic}`;
    try {
      const text = await generateText({
        type: campaign.content_type,
        prompt,
        platform: selectedBrand?.name || "General",
        tone: campaign.tone,
      });
      setCampaign(p => ({ ...p, ai_output: text }));
    } catch (e) {
      setError("Content generation failed: " + (e?.message || "unknown error"));
    } finally {
      setGenerating(false);
    }
  };

  // ── Real upload (was base44.storage.uploadFile, which the app doesn't expose) ──
  const uploadMedia = async (files) => {
    if (!files?.length) return;
    setError("");
    const urls = [];
    for (const file of Array.from(files)) {
      try {
        const url = await uploadFile(file);
        if (url) urls.push(url);
      } catch (e) { console.error(e); }
    }
    if (urls.length) setCampaign(p => ({ ...p, media_urls: [...p.media_urls, ...urls] }));
    else setError("Upload failed — check your connection and try again.");
  };

  const genImage = async () => {
    if (!campaign.ai_prompt.trim() && !campaign.ai_output.trim()) {
      setError("Add a prompt in the Copy & Scripts step first.");
      return;
    }
    setGeneratingMedia(true);
    setError("");
    setUpgradeRequired(false);
    try {
      const brandContext = selectedBrand
        ? ` Brand: ${selectedBrand.name}.${selectedBrand.brand_voice ? ` Brand voice: ${selectedBrand.brand_voice}.` : ""}${selectedBrand.primary_color ? ` Incorporate the brand color ${selectedBrand.primary_color} as an accent.` : ""}`
        : "";
      const url = await generateImage({
        prompt: `High quality professional marketing image for: ${campaign.ai_prompt || campaign.ai_output}.${brandContext} ${campaign.tone} style, 8k, highly detailed, no text overlay.`,
        platform: selectedBrand?.name || "General",
      });
      if (!url) { setError("Image generation returned no result."); setGeneratingMedia(false); return; }

      // Overlay the brand logo (if set) and persist the branded version.
      let finalUrl = url;
      const logoUrl = selectedBrand?.logo_file_url || selectedBrand?.logo_url || "";
      if (logoUrl) {
        try {
          const branded = await compositeLogo(url, logoUrl);
          if (branded) {
            const hostedUrl = await uploadFile(new File([branded], "branded-image.png", { type: "image/png" }));
            if (hostedUrl) finalUrl = hostedUrl;
          }
        } catch (_e) {
          // fall back to the un-branded image
        }
      }
      setCampaign(p => ({ ...p, media_urls: [...p.media_urls, finalUrl] }));
    } catch (e) {
      if (e?.upgradeRequired) {
        setError(e.message);
        setUpgradeRequired(true);
      } else {
        setError("Image generation failed: " + (e?.message || "unknown error"));
      }
    }
    setGeneratingMedia(false);
  };

  // ── Background music upload (real audio source for assembleLane1Video) ──
  const uploadMusic = async (file) => {
    if (!file) return;
    setUploadingMusic(true);
    setError("");
    try {
      const url = await uploadFile(file);
      if (url) setCampaign(p => ({ ...p, video_settings: { ...p.video_settings, musicUrl: url, musicName: file.name } }));
      else setError("Music upload failed — check your connection and try again.");
    } catch (e) { setError("Music upload failed: " + (e?.message || "unknown error")); }
    setUploadingMusic(false);
  };

  // Write a narration script purpose-built for the video — not the raw post
  // copy/caption (`ai_output`), which was previously chopped mechanically
  // across scenes and read verbatim regardless of what's actually on screen.
  // Falls back to the post copy if the AI call fails, so video assembly
  // never hard-fails just because narration generation did.
  const buildVideoNarration = async (sceneCount) => {
    const brandContext = selectedBrand
      ? ` Brand: ${selectedBrand.name}. Industry: ${selectedBrand.industry || "General"}. Voice: ${selectedBrand.brand_voice || campaign.tone}.`
      : "";
    const topic = campaign.ai_prompt || campaign.ai_output || campaign.campaign_name || "this brand's product or service";
    try {
      const narration = await generateText({
        type: "video_script",
        prompt: `Write a short, vivid voiceover narration (plain prose, no scene labels, no markdown, no preamble) for a ${sceneCount}-scene marketing video.${brandContext} Topic: ${topic}`,
        platform: selectedBrand?.name || "General",
        tone: campaign.tone,
      });
      return (narration || "").trim();
    } catch (_e) {
      return "";
    }
  };

  // Derives Lane 1's 3-way audioMode from Campaign Studio's existing
  // voice/music settings (no new UI needed here — Work Package H's audio
  // toggle is exposed in Quick Create; Campaign Studio just gets the same
  // underlying quality/audio upgrade from its existing controls). Falls
  // back from voiceover to music to silent if voiceover generation fails.
  const resolveLane1Audio = async (scenes, filenamePrefix) => {
    const wantsVoiceover = campaign.video_settings.voice !== "No Voiceover";
    const musicUrl = campaign.video_settings.musicUrl || undefined;
    if (wantsVoiceover) {
      const blob = await generateVoiceover(scenes.map(s => s.text).join(". "));
      if (blob) {
        const voiceoverUrl = await uploadFile(new File([blob], `${filenamePrefix}.mp3`, { type: blob.type || "audio/mpeg" }));
        if (voiceoverUrl) return { audioMode: "voiceover", voiceoverUrl, musicUrl };
      }
    }
    return { audioMode: musicUrl ? "music" : "silent", voiceoverUrl: undefined, musicUrl };
  };

  // ── Real video assembly (was client-side Canvas+MediaRecorder → silent,
  // capped-resolution WebM; now the same server-side Lane 1 FFmpeg pipeline
  // Quick Create uses — 1080p H.264 with real audio) ──
  const compileVideo = async () => {
    const images = campaign.media_urls.filter(isImageUrl);
    if (!images.length) { setError("Add or generate at least one image before compiling a video."); return; }
    setError(""); setWarnings([]);
    setGeneratingMedia(true);
    setVideoProgress(0);
    try {
      const narration = await buildVideoNarration(images.length);
      setCampaign(p => ({ ...p, video_narration: narration }));
      const sceneScripts = splitScriptIntoScenes(narration || campaign.ai_output || campaign.campaign_name || "", images.length);
      const scenes = images.map((url, i) => ({ imageUrl: url, text: sceneScripts[i]?.text || "", seconds: 8 }));

      const { audioMode, voiceoverUrl, musicUrl } = await resolveLane1Audio(scenes, "campaign-vo");
      const url = await assembleLane1Video({
        scenes, ratio: "9:16", resolution: "1080p", audioMode, voiceoverUrl, musicUrl,
      }, { onProgress: setVideoProgress });
      setCampaign(p => ({ ...p, video_url: url }));
    } catch (e) {
      setError("Video compile failed: " + (e?.message || "unknown error"));
    }
    setGeneratingMedia(false);
  };

  // ── Per-platform resize: re-render the compiled video at another aspect ratio ──
  const repurposeVideo = async (platform, ratio) => {
    const images = campaign.media_urls.filter(isImageUrl);
    if (!images.length) { setError("Add at least one image in Media & Clips before resizing for platforms."); return; }
    setError(""); setWarnings([]);
    setRepurposing(p => ({ ...p, [platform]: true }));
    try {
      // Reuse the narration generated for the main compiled video so the
      // repurposed (resized) version stays consistent with it — only
      // generate a fresh one if the user repurposes before compiling.
      const narration = campaign.video_narration || await buildVideoNarration(images.length);
      const sceneScripts = splitScriptIntoScenes(narration || campaign.ai_output || campaign.campaign_name || "", images.length);
      const scenes = images.map((url, i) => ({ imageUrl: url, text: sceneScripts[i]?.text || "", seconds: 8 }));

      const { audioMode, voiceoverUrl, musicUrl } = await resolveLane1Audio(scenes, `campaign-vo-${platform}`);
      const url = await assembleLane1Video({
        scenes, ratio, resolution: "1080p", audioMode, voiceoverUrl, musicUrl,
      });
      setCampaign(p => ({ ...p, platform_overrides: { ...p.platform_overrides, [platform]: { ...(p.platform_overrides?.[platform] || {}), media_url: url, ratio } } }));
    } catch (e) {
      setError(`Resize for ${platform} failed: ` + (e?.message || "unknown error"));
    }
    setRepurposing(p => ({ ...p, [platform]: false }));
  };

  // ── Per-platform hashtags + description/auto-caption ──
  const generatePlatformCopy = async (platform) => {
    setError("");
    setGeneratingCopyFor(platform);
    try {
      const platformLabel = PLATFORM_META[platform]?.label || platform;
      const topic = campaign.ai_output || campaign.ai_prompt || campaign.campaign_name || "this brand";
      const hashtags = await generateText({
        type: "hashtag_set",
        prompt: `List 12-15 high-reach, relevant ${platformLabel} hashtags (space-separated, each starting with #, no commentary or numbering) for the following post: ${topic}`,
        platform: platformLabel,
        tone: campaign.tone,
      });
      const description = await generateText({
        type: "caption",
        prompt: `Write a short ${platformLabel}-specific description or auto-caption (2-3 sentences, no hashtags) tailored to ${platformLabel}'s audience and format, in a ${campaign.tone} tone, for the following post: ${topic}`,
        platform: platformLabel,
        tone: campaign.tone,
      });
      setCampaign(p => ({ ...p, platform_overrides: { ...p.platform_overrides, [platform]: { ...(p.platform_overrides?.[platform] || {}), hashtags: hashtags?.trim() || "", description: description?.trim() || "" } } }));
    } catch (e) {
      setError(`Generation for ${platform} failed: ` + (e?.message || "unknown error"));
    }
    setGeneratingCopyFor(null);
  };

  // ── Auto-pick a fresh theme (from brand website/industry/voice) and write copy for it ──
  const generateAutoThemeCaption = async (index, total) => {
    const brandContext = selectedBrand
      ? `Brand: ${selectedBrand.name}. Industry: ${selectedBrand.industry || "General"}. Voice: ${selectedBrand.brand_voice || campaign.tone}.${selectedBrand.website ? ` Website: ${selectedBrand.website}.` : ""}${selectedBrand.target_audience ? ` Target audience: ${selectedBrand.target_audience}.` : ""}`
      : "";
    const themePrompt = `${brandContext}\nThis is post ${index + 1} of ${total} in an ongoing recurring content series for this brand. Suggest ONE fresh, specific marketing topic or theme (a single sentence, no preamble, no quotes) for this post. Base it on the brand's industry, website and audience above, and make it different from a generic post.`;
    let theme = campaign.ai_prompt || campaign.campaign_name || "a fresh update from the brand";
    try {
      const result = await generateText({ type: "theme", prompt: themePrompt, platform: selectedBrand?.name || "General", tone: campaign.tone });
      if (result?.trim()) theme = result.trim();
    } catch (_) { /* keep fallback theme */ }
    const contentPrompt = `${brandContext}\nWrite a ${campaign.length} ${campaign.content_type.replace(/_/g, " ")} in a ${campaign.tone} tone, formatted as ${campaign.format}.\nTopic: ${theme}`;
    return generateText({ type: campaign.content_type, prompt: contentPrompt, platform: selectedBrand?.name || "General", tone: campaign.tone });
  };

  // ── Real publish (was setTimeout that persisted nothing) ──
  const publishCampaign = async () => {
    setSaving(true);
    setError("");
    setPublishReport([]);
    setPublishStatus("");
    try {
      // 1. Save generated copy to the Media Library
      // (CampaignStudio's content types don't map 1:1 onto ContentAsset.type — translate them.)
      if (campaign.ai_output) {
        await base44.entities.ContentAsset.create({
          type: CONTENT_TYPE_TO_ASSET_TYPE[campaign.content_type] || "caption",
          title: campaign.campaign_name || "Campaign content",
          content: campaign.ai_output,
          ai_generated: true,
        });
      }

      const slots = campaign.schedules.filter(s => s.date);
      const repeat = campaign.repeat || {};
      const willRepeat = !campaign.postNow && repeat.enabled;

      // Build per-occurrence captions + dates. Occurrence 0 is the campaign's
      // primary generated copy; occurrences 1..N (when repeating) each get a
      // fresh, AI-picked theme + caption based on the brand's context.
      const occurrenceCaptions = [campaign.ai_output || ""];
      let occurrenceDates = [];
      if (willRepeat) {
        const anchor = slots[0]?.date
          ? new Date(`${slots[0].date}T${slots[0].time || "09:00"}`)
          : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; })();
        occurrenceDates = computeOccurrenceDates(anchor, repeat.cadence, repeat.months);
        for (let i = 1; i < occurrenceDates.length; i++) {
          setPublishStatus(`Generating content for post ${i + 1} of ${occurrenceDates.length}...`);
          try {
            occurrenceCaptions.push(await generateAutoThemeCaption(i, occurrenceDates.length));
          } catch (_) {
            occurrenceCaptions.push(campaign.ai_output || "");
          }
        }
        setPublishStatus("");
      }

      const captionFor = (occurrenceCaption, platform, fallback = "") => {
        const override = platform ? campaign.platform_overrides?.[platform] || {} : {};
        const hashtags = campaign.include_hashtags === false ? "" : (override.hashtags || campaign.outputs?.hashtag_set || "");
        const base = occurrenceCaption || fallback;
        return hashtags ? `${base}\n\n${hashtags}` : base;
      };

      const mediaFor = (platform) => {
        const override = campaign.platform_overrides?.[platform] || {};
        let media_url = override.media_url || campaign.video_url || campaign.media_urls[0] || "";
        // ScheduledPost.media_type only accepts image/video/reel/story/carousel — never "".
        let media_type = (override.media_url || campaign.video_url) ? "video" : "image";
        if (override.thumbnail) { media_url = override.thumbnail; media_type = "image"; }
        return { media_url, media_type, description: override.description || "" };
      };

      const fullCaption = captionFor(occurrenceCaptions[0]);

      // 2. Create the marketing campaign record
      await base44.entities.MarketingCampaign.create({
        name: campaign.campaign_name || "Untitled Campaign",
        type: "social",
        body: fullCaption || "",
        status: campaign.postNow ? "running" : ((slots.length || willRepeat) ? "scheduled" : "draft"),
        sent_count: 0, open_count: 0, click_count: 0,
      });

      // 3. Create scheduled posts for selected accounts
      const accounts = brandAccounts.filter(a => campaign.selected_accounts.includes(a.id));
      const report = [];

      // Re-verify every selected account's real connection status right
      // before publishing — not the stored field, which can be stale — so a
      // never-actually-authorized or since-expired account is caught here
      // instead of failing silently downstream. Also updates the Accounts
      // step badges for consistency.
      setPublishStatus("Checking account connections...");
      const freshChecks = {};
      await Promise.all(accounts.map(async (acc) => {
        freshChecks[acc.id] = await verifyOneAccount(acc);
      }));
      setVerifiedStatus(prev => ({ ...prev, ...freshChecks }));
      setPublishStatus("");
      const isAuthorized = (acc) => isAuthorizedStatus(freshChecks[acc.id]?.status || acc.status);
      const authFailureMessage = (acc) =>
        freshChecks[acc.id]?.message || "Not connected — reconnect this account in Brand Manager.";

      if (campaign.postNow) {
        // Post Now: create a draft post per eligible account, then publish each immediately.
        const toPublish = [];
        for (const acc of accounts) {
          if (!isAuthorized(acc)) {
            report.push({ account_name: acc.account_name, platform: acc.platform, status: "skipped", message: authFailureMessage(acc) });
          } else if (!SCHEDULABLE_PLATFORMS.has(acc.platform)) {
            report.push({ account_name: acc.account_name, platform: acc.platform, status: "skipped", message: "Use the Email / WhatsApp tools in Social Hub for this channel." });
          } else {
            toPublish.push(acc);
          }
        }
        for (const acc of toPublish) {
          const { media_url, media_type, description } = mediaFor(acc.platform);
          const platformLabel = PLATFORM_META[acc.platform]?.label || acc.platform;
          setPublishStatus(`Posting to ${acc.account_name} (${platformLabel})...`);
          try {
            const created = await base44.entities.ScheduledPost.create({
              social_account_id: acc.id,
              platform: acc.platform,
              caption: captionFor(occurrenceCaptions[0], acc.platform) || "",
              media_url,
              media_type,
              description,
              scheduled_at: "",
              status: "draft",
            });
            // Publish immediately and read back the REAL per-post result
            // (status/post_url/error) instead of assuming success.
            const res = await base44.functions.invoke("publishScheduledPosts", { post_id: created.id });
            const result = res?.data?.results?.[0] || res?.results?.[0];
            if (result?.status === "posted") {
              report.push({ account_name: acc.account_name, platform: acc.platform, status: "ok", message: "Posted live.", post_url: result.post_url || "" });
            } else {
              report.push({ account_name: acc.account_name, platform: acc.platform, status: "failed", message: result?.error || "Publish failed — check this account's connection in Brand Manager." });
            }
          } catch (e) {
            report.push({ account_name: acc.account_name, platform: acc.platform, status: "failed", message: e?.message || "Publish failed." });
          }
        }
        setPublishStatus("");
      } else {
        for (const acc of accounts) {
          if (!isAuthorized(acc)) {
            report.push({ account_name: acc.account_name, platform: acc.platform, status: "skipped", message: authFailureMessage(acc) });
            continue;
          }
          if (!SCHEDULABLE_PLATFORMS.has(acc.platform)) {
            report.push({ account_name: acc.account_name, platform: acc.platform, status: "skipped", message: "Use the Email / WhatsApp tools in Social Hub for this channel." });
            continue;
          }
          const { media_url, media_type, description } = mediaFor(acc.platform);

          if (willRepeat) {
            // Recurring: one post per occurrence, each with its own auto-themed caption.
            let failed = 0;
            for (let i = 0; i < occurrenceDates.length; i++) {
              try {
                await base44.entities.ScheduledPost.create({
                  social_account_id: acc.id,
                  platform: acc.platform,
                  caption: captionFor(occurrenceCaptions[i], acc.platform) || "",
                  media_url,
                  media_type,
                  description,
                  scheduled_at: occurrenceDates[i].toISOString(),
                  status: "scheduled",
                });
              } catch (_) {
                failed++;
              }
            }
            const cadenceLabel = repeat.cadence === "weekly" ? "weekly" : repeat.cadence === "biweekly" ? "every 2 weeks" : "monthly";
            report.push(failed
              ? { account_name: acc.account_name, platform: acc.platform, status: "failed", message: `${occurrenceDates.length - failed} of ${occurrenceDates.length} recurring posts scheduled — ${failed} failed.` }
              : { account_name: acc.account_name, platform: acc.platform, status: "ok", message: `${occurrenceDates.length} posts scheduled (${cadenceLabel} for ${repeat.months} months), each with fresh AI-generated content.` });
          } else {
            // One-off: one post per timeline slot (or a single draft if none set).
            const effectiveSlots = slots.length ? slots : [{ date: "", time: "", topic: "" }];
            for (const slot of effectiveSlots) {
              const scheduledAt = slot.date ? new Date(`${slot.date}T${slot.time || "09:00"}`).toISOString() : "";
              try {
                await base44.entities.ScheduledPost.create({
                  social_account_id: acc.id,
                  platform: acc.platform,
                  caption: captionFor(occurrenceCaptions[0], acc.platform, slot.topic) || "",
                  media_url,
                  media_type,
                  description,
                  scheduled_at: scheduledAt,
                  status: scheduledAt ? "scheduled" : "draft",
                });
                report.push({ account_name: acc.account_name, platform: acc.platform, status: "ok", message: scheduledAt ? `Scheduled for ${new Date(scheduledAt).toLocaleString()}` : "Saved as a draft." });
              } catch (e) {
                report.push({ account_name: acc.account_name, platform: acc.platform, status: "failed", message: e?.message || "Unknown error" });
              }
            }
          }
        }
      }
      setPublishReport(report);

      qc.invalidateQueries(["campaigns"]);
      qc.invalidateQueries(["scheduled_posts"]);
      qc.invalidateQueries(["media_library"]);
      setSaved(true);
    } catch (e) {
      setError("Publish failed: " + (e?.message || "unknown error"));
    }
    setSaving(false);
    setPublishStatus("");
  };

  const canNext = () => (step === 0 ? !!campaign.brand_id : true);
  const imageCount = campaign.media_urls.filter(isImageUrl).length;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 p-4">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 to-purple-600 flex items-center gap-3">
            <Sparkles className="text-fuchsia-500" /> Studio
          </h1>
          <p className="text-neutral-400 mt-2">The complete AI pipeline for copy, scripts, images, and video.</p>
        </div>
        <button onClick={() => setShowDemo(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all font-medium text-sm text-white">
          <PlayCircle className="w-5 h-5 text-fuchsia-400" /> Watch Studio Tutorial
        </button>
      </div>

      {error && !upgradeRequired && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
          <button onClick={() => setWarnings([])} className="shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {upgradeRequired && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/30 text-sm">
          <div className="flex items-start gap-3 flex-1 text-fuchsia-200">
            <Sparkles className="w-5 h-5 shrink-0 mt-0.5 text-fuchsia-400" /> {error}
          </div>
          <button onClick={() => navigate("/pricing")}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 transition-all">
            View Plans &amp; Pricing
          </button>
        </div>
      )}

      {/* STEP INDICATOR */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = step === i;
          const isPast = i < step;
          return (
            <button key={s.id} onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all flex-shrink-0 border ${
                isActive ? "bg-fuchsia-500/10 border-fuchsia-500/50 text-fuchsia-400" :
                isPast ? "bg-neutral-900 border-neutral-800 text-neutral-300" : "bg-transparent border-transparent text-neutral-600"
              }`}>
              {isPast ? <Check className="w-4 h-4 text-emerald-500" /> : <Icon className="w-4 h-4" />} {s.label}
            </button>
          );
        })}
      </div>

      {/* MAIN CARD */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 md:p-10 min-h-[500px] shadow-2xl relative overflow-hidden">

        {step === 0 && <BrandStep campaign={campaign} setCampaign={setCampaign} brands={brands} navigate={navigate} />}

        {step === 1 && <AccountsStep campaign={campaign} setCampaign={setCampaign} brandAccounts={brandAccounts} navigate={navigate} verifiedStatus={verifiedStatus} />}

        {step === 2 && (
          <ContentStep campaign={campaign} setCampaign={setCampaign} selectedBrand={selectedBrand}
            generating={generating} generateContent={generateContent} setError={setError} />
        )}

        {step === 3 && (
          <MediaStep campaign={campaign} setCampaign={setCampaign} mediaRef={mediaRef} musicRef={musicRef}
            uploadMedia={uploadMedia} genImage={genImage} uploadMusic={uploadMusic} compileVideo={compileVideo}
            generatingMedia={generatingMedia} uploadingMusic={uploadingMusic} videoProgress={videoProgress} imageCount={imageCount} />
        )}

        {step === 4 && (
          <RepurposeStep campaign={campaign} setCampaign={setCampaign} brandAccounts={brandAccounts}
            repurposeVideo={repurposeVideo} generatePlatformCopy={generatePlatformCopy}
            repurposing={repurposing} generatingCopyFor={generatingCopyFor} />
        )}

        {step === 5 && <PreviewStep campaign={campaign} brandAccounts={brandAccounts} imageCount={imageCount} />}

        {step === 6 && <TimelineStep campaign={campaign} setCampaign={setCampaign} />}

        {step === 7 && (
          <LaunchStep campaign={campaign} navigate={navigate} saving={saving} saved={saved}
            publishReport={publishReport} publishCampaign={publishCampaign} imageCount={imageCount} publishStatus={publishStatus} />
        )}
      </div>

      {/* FOOTER NAV */}
      {!saved && (
        <div className="flex justify-between items-center mt-8">
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="px-6 py-3 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-full font-bold text-white disabled:opacity-30 transition-colors">Back</button>
          {step < STEPS.length - 1 && (
            <button onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()} className="px-8 py-3 bg-white hover:bg-neutral-200 text-black rounded-full font-black disabled:opacity-50 transition-colors">Continue Step</button>
          )}
        </div>
      )}

      {/* TUTORIAL WALKTHROUGH (was a fake stock video, now real in-app step guide) */}
      {showDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <h3 className="font-bold text-white flex items-center gap-3 text-lg"><Sparkles className="w-5 h-5 text-fuchsia-500" /> Studio Walkthrough</h3>
              <button onClick={() => setShowDemo(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto">
              {WALKTHROUGH_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-neutral-950 border border-neutral-800">
                    <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-fuchsia-400" />
                    </div>
                    <div>
                      <p className="font-bold text-white">{s.title}</p>
                      <p className="text-sm text-neutral-400 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
