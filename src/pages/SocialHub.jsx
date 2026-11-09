import { useState, useRef, useEffect } from "react";
import { useOutletContext, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import {
  Share2, Plus, Calendar, Clock, Loader2, X,
  Send, ExternalLink, AlertCircle, RefreshCw, Trash2, Image, Video,
  Music, ChevronRight, ChevronLeft, Sparkles, Upload, Mail, MessageSquare,
  Hash, Users, List, Zap, Check
} from "lucide-react";
import AddAccountModal from "@/components/social-hub/AddAccountModal";
import { connectionBadge, verifyAccounts } from "@/utils/socialAccountStatus";
import { needsReconnect } from "@/config/socialConnect";

// ── Platform config ──────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "instagram",  label: "Instagram",  short: "IG",  color: "from-pink-500 to-rose-600",    bg: "bg-pink-500/10 border-pink-500/30 text-pink-400" },
  { id: "facebook",   label: "Facebook",   short: "FB",  color: "from-blue-500 to-blue-700",    bg: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { id: "tiktok",     label: "TikTok",     short: "TT",  color: "from-gray-700 to-gray-900",    bg: "bg-gray-500/10 border-gray-500/30 text-gray-300" },
  { id: "linkedin",   label: "LinkedIn",   short: "LI",  color: "from-blue-600 to-blue-800",    bg: "bg-sky-500/10 border-sky-500/30 text-sky-400" },
  { id: "youtube",    label: "YouTube",    short: "YT",  color: "from-red-500 to-red-700",      bg: "bg-red-500/10 border-red-500/30 text-red-400" },
  { id: "twitter_x",  label: "Twitter/X",  short: "X",   color: "from-gray-600 to-gray-900",    bg: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300" },
  { id: "whatsapp",   label: "WhatsApp",   short: "WA",  color: "from-green-500 to-emerald-600", bg: "bg-green-500/10 border-green-500/30 text-green-400" },
  { id: "email",      label: "Email",      short: "EM",  color: "from-violet-500 to-purple-600", bg: "bg-violet-500/10 border-violet-500/30 text-violet-400" },
];

// ── Content types per platform ───────────────────────────────────────────────
const CONTENT_TYPES = {
  instagram: [
    { id: "post",     label: "Feed Post",   size: "1080×1080 (1:1)",   icon: "🖼️" },
    { id: "reel",     label: "Reel",        size: "1080×1920 (9:16)",  icon: "🎬" },
    { id: "story",    label: "Story",       size: "1080×1920 (9:16)",  icon: "⭕" },
    { id: "carousel", label: "Carousel",    size: "1080×1080 (1:1)",   icon: "🔄" },
  ],
  facebook: [
    { id: "post",     label: "Feed Post",   size: "1200×630 (1.91:1)", icon: "🖼️" },
    { id: "reel",     label: "Reel",        size: "1080×1920 (9:16)",  icon: "🎬" },
    { id: "story",    label: "Story",       size: "1080×1920 (9:16)",  icon: "⭕" },
  ],
  tiktok: [
    { id: "video",    label: "TikTok Video", size: "1080×1920 (9:16)", icon: "🎵" },
    { id: "photo",    label: "Photo Post",   size: "1080×1350 (4:5)",  icon: "🖼️" },
  ],
  linkedin: [
    { id: "post",     label: "Post",         size: "1200×627 (1.91:1)", icon: "📝" },
    { id: "article",  label: "Article",      size: "Text only",         icon: "📄" },
    { id: "video",    label: "Video",        size: "4096×2304 (16:9)",  icon: "🎬" },
  ],
  youtube: [
    { id: "video",    label: "Long Video",   size: "1920×1080 (16:9)",  icon: "▶️" },
    { id: "short",    label: "YouTube Short", size: "1080×1920 (9:16)", icon: "⚡" },
  ],
  twitter_x: [
    { id: "post",     label: "Tweet",        size: "1600×900 (16:9)",   icon: "✖️" },
    { id: "thread",   label: "Thread",       size: "Text + images",     icon: "🧵" },
  ],
  whatsapp: [
    { id: "broadcast", label: "Broadcast",   size: "Any",               icon: "📢" },
    { id: "status",    label: "Status",      size: "1080×1920 (9:16)",  icon: "⭕" },
  ],
  email: [
    { id: "campaign",  label: "Campaign",    size: "600px wide",        icon: "📧" },
    { id: "newsletter",label: "Newsletter",  size: "600px wide",        icon: "📰" },
  ],
};

const MUSIC_SUGGESTIONS = [
  { id: "upbeat_pop",     label: "Upbeat Pop",       mood: "Energetic 🎵" },
  { id: "cinematic",      label: "Cinematic Epic",   mood: "Dramatic 🎼" },
  { id: "chill_lofi",     label: "Chill Lo-Fi",      mood: "Relaxed 🎧" },
  { id: "corporate",      label: "Corporate Clean",  mood: "Professional 💼" },
  { id: "hip_hop_beat",   label: "Hip Hop Beat",     mood: "Trendy 🔥" },
  { id: "acoustic_warm",  label: "Acoustic Warm",    mood: "Authentic 🎸" },
  { id: "electronic",     label: "Electronic Pulse", mood: "Modern ⚡" },
  { id: "none",           label: "No Music",         mood: "Silent 🔇" },
];

const STATUS_COLORS = {
  scheduled: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  posted:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  draft:     "bg-muted text-muted-foreground border-border",
  failed:    "bg-red-500/10 text-red-400 border-red-500/20",
};

const WIZARD_STEPS = [
  { id: 1, label: "Plan",     icon: "🎯" },
  { id: 2, label: "Content",  icon: "🎨" },
  { id: 3, label: "Caption",  icon: "✍️" },
  { id: 4, label: "Schedule", icon: "📅" },
  { id: 5, label: "Confirm",  icon: "✅" },
];

// ── Main Component ───────────────────────────────────────────────────────────
export default function SocialHub() {
  const navigate = useNavigate();
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("posts"); // posts | calendar | email | whatsapp | bulk
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState("list"); // list | grid

  // Wizard form state
  const [wiz, setWiz] = useState({
    selectedPlatforms: ["instagram"],
    contentType: "post",
    caption: "",
    hashtags: "",
    mediaUrl: "",
    mediaType: "image",
    mediaPreview: null,
    musicNote: "",
    scheduledAt: "",
    postNow: false,
    aiTopic: "",
  });
  const [wizLoading, setWizLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [publishError, setPublishError] = useState({});
  const [showAddAccount, setShowAddAccount] = useState(false);
  // Non-null while reconnecting a specific account — the same modal, opened
  // on that account's platform and updating its record instead of creating
  // a second one.
  const [reconnectAccount, setReconnectAccount] = useState(null);
  const [testingId, setTestingId] = useState(null);

  // Email/WA blast state
  const [blastForm, setBlastForm] = useState({ campaign_id: "", channel: "email" });
  const [blasting, setBlasting] = useState(false);
  const [blastResult, setBlastResult] = useState(null);

  // Data queries
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["social_accounts", user?.email],
    queryFn: () => base44.entities.SocialAccount.filter(mine(user), "-created_date", 50),
    enabled: !!user?.email,
  });

  // Real connection status per account — the stored `status` field is only
  // ever corrected when something explicitly re-tests it, so it can sit
  // stale (e.g. a "credentials"-only account showing "active" indefinitely).
  // Verifies each newly-seen account once per load; ids already present
  // (including the "checking" placeholder) are skipped on later re-renders.
  const [verifiedStatus, setVerifiedStatus] = useState({});
  useEffect(() => {
    const unverified = accounts.filter(a => !(a.id in verifiedStatus));
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
  }, [accounts]);
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["scheduled_posts", user?.email],
    queryFn: () => base44.entities.ScheduledPost.filter(mine(user), "-scheduled_at", 200),
    enabled: !!user?.email,
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns_hub", user?.email],
    queryFn: () => base44.entities.MarketingCampaign.filter(mine(user), "-created_date", 50),
    enabled: !!user?.email,
  });

  // Stats
  const scheduledCount = posts.filter(p => p.status === "scheduled").length;
  const postedCount    = posts.filter(p => p.status === "posted").length;
  const dueCount       = posts.filter(p => p.status === "scheduled" && p.scheduled_at && new Date(p.scheduled_at) <= new Date()).length;
  const connectedPlatforms = [...new Set(accounts.map(a => a.platform))];

  // Filtered posts
  const filtered = posts.filter(p => {
    const matchPlatform = platformFilter === "all" || p.platform === platformFilter;
    const matchStatus   = statusFilter   === "all" || p.status   === statusFilter;
    return matchPlatform && matchStatus;
  });

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleMediaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const preview = URL.createObjectURL(file);
      const res = await base44.integrations.Core.UploadFile({ file });
      const url = res?.file_url || res?.url || preview;
      setWiz(w => ({
        ...w,
        mediaUrl: url,
        mediaPreview: preview,
        mediaType: file.type.startsWith("video") ? "video" : "image",
      }));
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
    setUploading(false);
  };

  // ── AI Caption ───────────────────────────────────────────────────────────────
  const generateAICaption = async () => {
    if (!wiz.aiTopic && !wiz.caption) { alert("Enter a topic first"); return; }
    setWizLoading(true);
    try {
      const platforms = wiz.selectedPlatforms.join(", ");
      const prompt = `Write a highly engaging ${platforms} ${wiz.contentType} caption for: "${wiz.aiTopic || wiz.caption}". 
Platform: ${platforms}. Content type: ${wiz.contentType}.
Include: hook line, body (2-3 sentences), strong CTA, 5 relevant emojis.
Also suggest 15 trending hashtags.
Format:
CAPTION:
[caption text]

HASHTAGS:
[hashtags]`;
      const res = await base44.functions.invoke("generateMediaContent", {
        type: "caption",
        prompt,
        platform: platforms,
        tone: "Engaging",
      });
      const raw = res?.content || res?.data?.content || res?.text || res?.data?.text || "";
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      const captionMatch = text.match(/CAPTION:\s*([\s\S]*?)(?=HASHTAGS:|$)/i);
      const hashMatch = text.match(/HASHTAGS:\s*([\s\S]*?)$/i);
      setWiz(w => ({
        ...w,
        caption: captionMatch ? captionMatch[1].trim() : text,
        hashtags: hashMatch ? hashMatch[1].trim() : w.hashtags,
        aiTopic: w.aiTopic || w.caption,
      }));
    } catch (err) { alert("AI failed: " + err.message); }
    setWizLoading(false);
  };

  // ── Save / Schedule post ─────────────────────────────────────────────────────
  const savePost = async () => {
    if (!wiz.caption.trim()) { alert("Caption is required"); return; }
    setSaving(true);
    try {
      const status = wiz.postNow ? "draft" : (wiz.scheduledAt ? "scheduled" : "draft");
      const fullCaption = wiz.hashtags
        ? `${wiz.caption}\n\n${wiz.hashtags}`
        : wiz.caption;

      // Create one post per selected platform
      for (const platform of wiz.selectedPlatforms) {
        const account = accounts.find(a => a.platform === platform);
        await base44.entities.ScheduledPost.create({
          social_account_id: account?.id || "",
          platform,
          caption: fullCaption,
          media_url: wiz.mediaUrl || "",
          media_type: wiz.mediaType,
          scheduled_at: wiz.scheduledAt || "",
          status,
        });
      }

      // If "Post Now" — trigger publish for each
      if (wiz.postNow) {
        const newPosts = await base44.entities.ScheduledPost.filter(mine(user), "-created_date", wiz.selectedPlatforms.length);
        const failures = [];
        for (const p of newPosts.slice(0, wiz.selectedPlatforms.length)) {
          try {
            const res = await base44.functions.invoke("publishScheduledPosts", { post_id: p.id });
            const data = res?.data || res || {};
            const failed = (data.results || []).filter((r) => r && r.status === "failed");
            failed.forEach((r) => failures.push((r.platform || p.platform) + ": " + (r.error || "Publish failed")));
          } catch (e) {
            failures.push((p.platform || "Post") + ": " + (e?.message || "Publish failed"));
          }
        }
        if (failures.length > 0) {
          alert("Some posts did not publish:\n\n" + failures.join("\n"));
        }
      }
      
      qc.invalidateQueries(["scheduled_posts"]);
      setShowWizard(false);
      resetWizard();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const resetWizard = () => {
    setWizardStep(1);
    setWiz({
      selectedPlatforms: ["instagram"], contentType: "post",
      caption: "", hashtags: "", mediaUrl: "", mediaType: "image",
      mediaPreview: null, musicNote: "", scheduledAt: "", postNow: false, aiTopic: "",
    });
  };

  const publishPost = async (post) => {
    setPublishingId(post.id);
    setPublishError(prev => ({ ...prev, [post.id]: null }));
    try {
      await base44.functions.invoke("publishScheduledPosts", { post_id: post.id });
      qc.invalidateQueries(["scheduled_posts"]);
    } catch (e) {
      setPublishError(prev => ({ ...prev, [post.id]: e.message }));
    }
    setPublishingId(null);
  };

  const publishAllDue = async () => {
    setPublishingId("all");
    try {
      await base44.functions.invoke("publishScheduledPosts", {});
      qc.invalidateQueries(["scheduled_posts"]);
    } catch (e) { alert(e.message); }
    setPublishingId(null);
  };

  const deletePost = async (id) => {
    if (!confirm("Delete this post?")) return;
    await base44.entities.ScheduledPost.delete(id);
    qc.invalidateQueries(["scheduled_posts"]);
  };

  const testConnection = async (accountId) => {
    setTestingId(accountId);
    try {
      const res = await base44.functions.invoke("testSocialConnection", { account_id: accountId });
      const data = res?.data ?? res;
      // Update the badge immediately from this response — invalidating the
      // query alone wouldn't re-trigger verification, since this account id
      // is already marked as checked.
      setVerifiedStatus(prev => ({ ...prev, [accountId]: { status: data?.status, message: data?.message || "", verified: true } }));
      qc.invalidateQueries(["social_accounts"]);
    } catch (e) {
      alert("Connection test failed: " + e.message);
    }
    setTestingId(null);
  };

  const sendBlast = async () => {
    if (!blastForm.campaign_id) { alert("Select a campaign"); return; }
    setBlasting(true);
    setBlastResult(null);
    try {
      const res = await base44.functions.invoke("sendBulkMessage", { campaign_id: blastForm.campaign_id });
      setBlastResult(res);
    } catch (e) { setBlastResult({ error: e.message }); }
    setBlasting(false);
  };

  // ── Wizard current content types ─────────────────────────────────────────────
  const currentContentTypes = wiz.selectedPlatforms.length === 1
    ? (CONTENT_TYPES[wiz.selectedPlatforms[0]] || CONTENT_TYPES.instagram)
    : CONTENT_TYPES.instagram;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Share2 className="w-6 h-6 text-fuchsia-400" /> Social Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create, schedule & publish across all channels
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {dueCount > 0 && (
            <button onClick={publishAllDue} disabled={publishingId === "all"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/25 transition-all">
              {publishingId === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Publish Due ({dueCount})
            </button>
          )}
          <button onClick={() => { setShowWizard(true); setWizardStep(1); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
            <Plus className="w-4 h-4" /> Create Post
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Posts",    value: posts.length,        color: "text-fuchsia-400" },
          { label: "Scheduled",      value: scheduledCount,      color: "text-amber-400" },
          { label: "Published",      value: postedCount,         color: "text-emerald-400" },
          { label: "Due Now",        value: dueCount,            color: "text-red-400" },
          { label: "Accounts",       value: accounts.length,     color: "text-sky-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "posts",    label: "Posts",     icon: <List className="w-4 h-4" /> },
          { id: "calendar", label: "Calendar",  icon: <Calendar className="w-4 h-4" /> },
          { id: "email",    label: "Email",     icon: <Mail className="w-4 h-4" /> },
          { id: "whatsapp", label: "WhatsApp",  icon: <MessageSquare className="w-4 h-4" /> },
          { id: "bulk",     label: "Bulk Send", icon: <Users className="w-4 h-4" /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? "border-fuchsia-500 text-fuchsia-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── POSTS TAB ── */}
      {activeTab === "posts" && (
        <div className="space-y-4">
          {/* Connected accounts */}
          {accounts.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connected Accounts</p>
                <button onClick={() => setShowAddAccount(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300">
                  <Plus className="w-3.5 h-3.5" /> Add Account
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {accounts.map(acc => {
                  const plt = PLATFORMS.find(p => p.id === acc.platform);
                  const liveStatus = verifiedStatus[acc.id]?.status || acc.status;
                  const st = connectionBadge(liveStatus);
                  const isTesting = testingId === acc.id;
                  // An expired or unauthorized account needs a new credential,
                  // not another test of the one that already failed. Re-testing
                  // was previously the only action offered, which is why an
                  // expired badge read as a dead end.
                  const canReconnect = needsReconnect(liveStatus) && acc.platform !== "email" && acc.platform !== "whatsapp";
                  return (
                    <div key={acc.id} title={verifiedStatus[acc.id]?.message || acc.description || st.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${plt?.bg || "bg-muted border-border text-foreground"}`}>
                      <span className="font-black">{plt?.short || "?"}</span>
                      {acc.account_name || acc.platform}
                      <span className={`flex items-center gap-1 ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                      </span>
                      {canReconnect && (
                        <button onClick={() => { setReconnectAccount(acc); setShowAddAccount(true); }}
                          className="px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold hover:bg-amber-500/30">
                          Reconnect
                        </button>
                      )}
                      <button onClick={() => testConnection(acc.id)} disabled={isTesting} title="Test connection"
                        className="hover:opacity-70 disabled:opacity-50">
                        {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!accountsLoading && accounts.length === 0 && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">No social accounts connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">Connect Instagram, Facebook, LinkedIn and more to schedule and publish posts.</p>
              </div>
              <button onClick={() => setShowAddAccount(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 transition-all flex-shrink-0">
                <Plus className="w-3.5 h-3.5" /> Add Account
              </button>
            </div>
          )}

          {/* Filters + view toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {["all", ...PLATFORMS.map(p => p.id)].map(f => (
                <button key={f} onClick={() => setPlatformFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    platformFilter === f ? "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>{PLATFORMS.find(p => p.id === f)?.label || "All"}</button>
              ))}
            </div>
            <div className="ml-auto flex gap-1">
              {["all", "scheduled", "posted", "draft", "failed"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    statusFilter === s ? "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* Posts list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-2xl">
              <Share2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-foreground font-semibold">No posts yet</p>
              <p className="text-muted-foreground text-sm mt-1">Click "Create Post" to schedule your first post</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(post => {
                const plt = PLATFORMS.find(p => p.id === post.platform);
                const isPublishing = publishingId === post.id;
                return (
                  <div key={post.id} className="bg-card border border-border rounded-2xl p-4 flex gap-4 items-start hover:border-fuchsia-500/20 transition-all">
                    {/* Platform badge */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plt?.color || "from-gray-500 to-gray-700"} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-xs font-black text-white">{plt?.short || "?"}</span>
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-2">{post.caption}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[post.status] || STATUS_COLORS.draft}`}>
                          {post.status}
                        </span>
                        {post.scheduled_at && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(post.scheduled_at).toLocaleString()}
                          </span>
                        )}
                        {post.media_url && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            {post.media_type === "video" ? <Video className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                            Media attached
                          </span>
                        )}
                      </div>
                      {post.status === "failed" && post.failure_reason && (
                        <p className="text-xs text-red-400 mt-1">{post.failure_reason}</p>
                      )}
                      {publishError[post.id] && (
                        <p className="text-xs text-red-400 mt-1">{publishError[post.id]}</p>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(post.status === "scheduled" || post.status === "draft") && (
                        <button onClick={() => publishPost(post)} disabled={isPublishing}
                          className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all" title="Publish Now">
                          {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      )}
                      {post.post_url && (
                        <a href={post.post_url} target="_blank" rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 transition-all" title="View Post">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => deletePost(post.id)}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR TAB ── */}
      {activeTab === "calendar" && (
        <CalendarView posts={posts} platforms={PLATFORMS} />
      )}

      {/* ── EMAIL TAB ── */}
      {activeTab === "email" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-bold text-foreground mb-1 flex items-center gap-2"><Mail className="w-5 h-5 text-violet-400" /> Email Campaign</h3>
            <p className="text-sm text-muted-foreground mb-5">Send a campaign to all opted-in email contacts</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Select Campaign</label>
                <select value={blastForm.campaign_id}
                  onChange={e => setBlastForm(f => ({ ...f, campaign_id: e.target.value, channel: "email" }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground">
                  <option value="">— Choose a campaign —</option>
                  {campaigns.filter(c => c.type === "email" || !c.type).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={sendBlast} disabled={blasting || !blastForm.campaign_id}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {blasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {blasting ? "Sending..." : "Send Email Campaign"}
              </button>
              {blastResult && (
                <div className={`p-4 rounded-xl text-sm ${blastResult.error ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                  {blastResult.error ? `Error: ${blastResult.error}` : `✅ Sent ${blastResult.sent || 0} emails · Failed: ${blastResult.failed || 0}`}
                </div>
              )}
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
              <Zap className="w-4 h-4 text-emerald-400" />
              Sending mode: {user?.settings?.api_keys?.sendgrid_key ? "Your SendGrid account" : "Platform-managed (Base44 / Resend)"}
            </div>
            <p className="text-xs text-muted-foreground">
              {user?.settings?.api_keys?.sendgrid_key
                ? "Emails send from your own SendGrid account — billed directly by SendGrid, no platform fee."
                : "Emails send via digitalstudios.app's built-in delivery (Base44 → Resend → SendGrid). Included in your plan's monthly quota; overage is billed per message at the rate shown on the Billing page."}
              {" "}<Link to="/settings" className="text-fuchsia-400 hover:underline">Manage in Settings</Link> · <Link to="/billing" className="text-fuchsia-400 hover:underline">View pricing</Link>
            </p>
          </div>
        </div>
      )}

      {/* ── WHATSAPP TAB ── */}
      {activeTab === "whatsapp" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-bold text-foreground mb-1 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-green-400" /> WhatsApp Broadcast</h3>
            <p className="text-sm text-muted-foreground mb-5">Send a broadcast to all opted-in WhatsApp contacts</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Select Campaign</label>
                <select value={blastForm.campaign_id}
                  onChange={e => setBlastForm(f => ({ ...f, campaign_id: e.target.value, channel: "whatsapp" }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground">
                  <option value="">— Choose a campaign —</option>
                  {campaigns.filter(c => c.type === "whatsapp" || !c.type).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={sendBlast} disabled={blasting || !blastForm.campaign_id}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {blasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {blasting ? "Sending..." : "Send WhatsApp Broadcast"}
              </button>
              {blastResult && (
                <div className={`p-4 rounded-xl text-sm ${blastResult.error ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                  {blastResult.error ? `Error: ${blastResult.error}` : `✅ Sent ${blastResult.sent || 0} · Failed: ${blastResult.failed || 0}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BULK SEND TAB ── */}
      {activeTab === "bulk" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-bold text-foreground mb-1 flex items-center gap-2"><Users className="w-5 h-5 text-fuchsia-400" /> Bulk Send</h3>
            <p className="text-sm text-muted-foreground mb-5">Send a campaign via Email, SMS, or WhatsApp to all matching contacts</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Channel</label>
                <div className="flex gap-2">
                  {["email","sms","whatsapp"].map(ch => (
                    <button key={ch} onClick={() => setBlastForm(f => ({ ...f, channel: ch }))}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize border transition-all ${
                        blastForm.channel === ch
                          ? "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30"
                          : "bg-muted text-muted-foreground border-border hover:text-foreground"
                      }`}>{ch}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Campaign</label>
                <select value={blastForm.campaign_id}
                  onChange={e => setBlastForm(f => ({ ...f, campaign_id: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground">
                  <option value="">— Choose a campaign —</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type || "general"})</option>
                  ))}
                </select>
              </div>
              <button onClick={sendBlast} disabled={blasting || !blastForm.campaign_id}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {blasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {blasting ? "Sending..." : `Send Bulk ${blastForm.channel.toUpperCase()}`}
              </button>
              {blastResult && (
                <div className={`p-4 rounded-xl text-sm ${blastResult.error ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                  {blastResult.error ? `Error: ${blastResult.error}` : `✅ Sent: ${blastResult.sent || 0} · Failed: ${blastResult.failed || 0} · Skipped: ${blastResult.skipped || 0}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE POST WIZARD ── */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-background border border-border rounded-2xl w-full max-w-2xl my-6 shadow-2xl">

            {/* Wizard header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-lg font-black text-foreground">Create Post</h2>
                <p className="text-xs text-muted-foreground">Step {wizardStep} of {WIZARD_STEPS.length}</p>
              </div>
              <button onClick={() => { setShowWizard(false); resetWizard(); }}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step progress */}
            <div className="flex items-center gap-0 px-5 pt-4">
              {WIZARD_STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center flex-1">
                  <button onClick={() => wizardStep > step.id && setWizardStep(step.id)}
                    className={`flex flex-col items-center gap-0.5 ${wizardStep > step.id ? "cursor-pointer" : "cursor-default"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      wizardStep === step.id ? "bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30"
                      : wizardStep > step.id ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-muted text-muted-foreground"
                    }`}>
                      {wizardStep > step.id ? <Check className="w-4 h-4" /> : step.icon}
                    </div>
                    <span className="text-[10px] text-muted-foreground hidden sm:block">{step.label}</span>
                  </button>
                  {i < WIZARD_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 ${wizardStep > step.id ? "bg-emerald-500/40" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div className="p-5 space-y-5 min-h-[300px]">

              {/* STEP 1 — Plan: choose platforms */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-foreground mb-1">Select Platforms</h3>
                    <p className="text-xs text-muted-foreground mb-3">Choose one or more platforms to post to simultaneously</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {PLATFORMS.map(plt => {
                        const isSelected = wiz.selectedPlatforms.includes(plt.id);
                        const isConnected = accounts.some(a => a.platform === plt.id);
                        return (
                          <button key={plt.id}
                            onClick={() => setWiz(w => ({
                              ...w,
                              selectedPlatforms: isSelected && w.selectedPlatforms.length > 1
                                ? w.selectedPlatforms.filter(p => p !== plt.id)
                                : isSelected ? w.selectedPlatforms : [...w.selectedPlatforms, plt.id]
                            }))}
                            className={`relative p-3 rounded-xl border text-sm font-semibold text-center transition-all ${
                              isSelected
                                ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300"
                                : "bg-card border-border text-muted-foreground hover:border-fuchsia-500/30 hover:text-foreground"
                            }`}>
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plt.color} flex items-center justify-center mx-auto mb-1.5`}>
                              <span className="text-xs font-black text-white">{plt.short}</span>
                            </div>
                            {plt.label}
                            {!isConnected && (
                              <span className="absolute top-1.5 right-1.5 text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded">setup</span>
                            )}
                            {isSelected && (
                              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1">Content Type</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {currentContentTypes.map(ct => (
                        <button key={ct.id} onClick={() => setWiz(w => ({ ...w, contentType: ct.id }))}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            wiz.contentType === ct.id
                              ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300"
                              : "bg-card border-border text-muted-foreground hover:border-fuchsia-500/30"
                          }`}>
                          <div className="text-lg mb-0.5">{ct.icon}</div>
                          <div className="text-sm font-semibold">{ct.label}</div>
                          <div className="text-[11px] text-muted-foreground">{ct.size}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2 — Content: upload media */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h3 className="font-bold text-foreground">Add Media</h3>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" />

                  {wiz.mediaPreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-border">
                      {wiz.mediaType === "video"
                        ? <video src={wiz.mediaPreview} className="w-full max-h-64 object-contain bg-black" controls />
                        : <img src={wiz.mediaPreview} alt="preview" className="w-full max-h-64 object-contain bg-black" />
                      }
                      <button onClick={() => setWiz(w => ({ ...w, mediaUrl: "", mediaPreview: null }))}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5 transition-all">
                      {uploading
                        ? <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400 mx-auto mb-2" />
                        : <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      }
                      <p className="text-sm font-medium text-foreground">{uploading ? "Uploading..." : "Click to upload image or video"}</p>
                      <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, MP4, MOV</p>
                    </div>
                  )}

                  {/* Music selection (for video/reel content types) */}
                  {["reel","video","short","tiktok"].includes(wiz.contentType) && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-2 block flex items-center gap-1"><Music className="w-3.5 h-3.5" /> Music / Audio Style</label>
                      <div className="grid grid-cols-2 gap-2">
                        {MUSIC_SUGGESTIONS.map(m => (
                          <button key={m.id} onClick={() => setWiz(w => ({ ...w, musicNote: m.id === "none" ? "" : m.label }))}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                              (wiz.musicNote === m.label || (m.id === "none" && !wiz.musicNote))
                                ? "bg-purple-500/15 border-purple-500/40 text-purple-300"
                                : "bg-card border-border text-muted-foreground hover:border-purple-500/30"
                            }`}>
                            <div className="font-semibold">{m.label}</div>
                            <div className="text-muted-foreground">{m.mood}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Or enter media URL manually */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Or paste media URL</label>
                    <input type="url" value={wiz.mediaUrl} onChange={e => setWiz(w => ({ ...w, mediaUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* STEP 3 — Caption */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h3 className="font-bold text-foreground">Write Caption</h3>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Topic / Brief (for AI generation)</label>
                    <div className="flex gap-2">
                      <input type="text" value={wiz.aiTopic}
                        onChange={e => setWiz(w => ({ ...w, aiTopic: e.target.value }))}
                        placeholder="e.g. Summer sale 50% off all products"
                        className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
                      <button onClick={generateAICaption} disabled={wizLoading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                        {wizLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        AI Write
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Caption</label>
                    <textarea value={wiz.caption} onChange={e => setWiz(w => ({ ...w, caption: e.target.value }))}
                      rows={5} placeholder="Write your caption here..."
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none" />
                    <p className="text-xs text-muted-foreground mt-1">{wiz.caption.length} characters</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Hashtags</label>
                    <textarea value={wiz.hashtags} onChange={e => setWiz(w => ({ ...w, hashtags: e.target.value }))}
                      rows={2} placeholder="#marketing #socialmedia #growyourbusiness"
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none" />
                  </div>
                </div>
              )}

              {/* STEP 4 — Schedule */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h3 className="font-bold text-foreground">Schedule</h3>
                  <div className="flex gap-3">
                    <button onClick={() => setWiz(w => ({ ...w, postNow: false }))}
                      className={`flex-1 p-4 rounded-xl border text-center transition-all ${
                        !wiz.postNow ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300" : "bg-card border-border text-muted-foreground"
                      }`}>
                      <Calendar className="w-6 h-6 mx-auto mb-1" />
                      <div className="text-sm font-semibold">Schedule for Later</div>
                    </button>
                    <button onClick={() => setWiz(w => ({ ...w, postNow: true, scheduledAt: "" }))}
                      className={`flex-1 p-4 rounded-xl border text-center transition-all ${
                        wiz.postNow ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" : "bg-card border-border text-muted-foreground"
                      }`}>
                      <Zap className="w-6 h-6 mx-auto mb-1" />
                      <div className="text-sm font-semibold">Post Now</div>
                    </button>
                  </div>
                  {!wiz.postNow && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Date & Time</label>
                      <input type="datetime-local" value={wiz.scheduledAt}
                        onChange={e => setWiz(w => ({ ...w, scheduledAt: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground" />
                    </div>
                  )}
                  {/* Best time suggestions */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">⏰ Best Times to Post</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>📱 Instagram: 6–9am, 12–2pm</div>
                      <div>👔 LinkedIn: Tue–Thu 9–11am</div>
                      <div>🎵 TikTok: 7–9am, 7–11pm</div>
                      <div>▶️ YouTube: Fri–Sat 12–4pm</div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5 — Confirm */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <h3 className="font-bold text-foreground">Confirm & Post</h3>
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-24">Platforms</span>
                      <div className="flex gap-1 flex-wrap">
                        {wiz.selectedPlatforms.map(p => {
                          const plt = PLATFORMS.find(pl => pl.id === p);
                          return (
                            <span key={p} className={`px-2 py-0.5 rounded-full text-xs font-bold border ${plt?.bg}`}>{plt?.label}</span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-24">Type</span>
                      <span className="text-xs text-foreground capitalize">{wiz.contentType}</span>
                    </div>
                    {wiz.mediaPreview && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground w-24">Media</span>
                        {wiz.mediaType === "image"
                          ? <img src={wiz.mediaPreview} alt="" className="w-16 h-16 object-cover rounded-lg" />
                          : <span className="text-xs text-foreground">Video attached ✅</span>
                        }
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-24 pt-0.5">Caption</span>
                      <p className="text-xs text-foreground line-clamp-3">{wiz.caption || <span className="text-muted-foreground italic">No caption</span>}</p>
                    </div>
                    {wiz.hashtags && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-semibold text-muted-foreground w-24 pt-0.5">Hashtags</span>
                        <p className="text-xs text-fuchsia-400 line-clamp-2">{wiz.hashtags}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-24">Schedule</span>
                      <span className="text-xs text-foreground">
                        {wiz.postNow ? "🚀 Post Immediately" : wiz.scheduledAt ? new Date(wiz.scheduledAt).toLocaleString() : "Save as Draft"}
                      </span>
                    </div>
                    {wiz.musicNote && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground w-24">Music</span>
                        <span className="text-xs text-foreground">🎵 {wiz.musicNote}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard nav */}
            <div className="flex items-center justify-between p-5 border-t border-border">
              <button onClick={() => wizardStep > 1 ? setWizardStep(s => s - 1) : (setShowWizard(false), resetWizard())}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground text-sm font-semibold transition-all">
                <ChevronLeft className="w-4 h-4" />
                {wizardStep === 1 ? "Cancel" : "Back"}
              </button>
              {wizardStep < WIZARD_STEPS.length ? (
                <button onClick={() => setWizardStep(s => s + 1)}
                  disabled={wizardStep === 1 && wiz.selectedPlatforms.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={savePost} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : wiz.postNow ? <Send className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                  {saving ? "Saving..." : wiz.postNow ? "Post Now" : wiz.scheduledAt ? "Schedule Post" : "Save Draft"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <AddAccountModal open={showAddAccount} account={reconnectAccount} platforms={PLATFORMS}
        onClose={() => { setShowAddAccount(false); setReconnectAccount(null); }}
        onSaved={() => {
          // Drop the cached verification for the account just saved so its
          // badge re-checks instead of showing the pre-reconnect state.
          if (reconnectAccount?.id) {
            setVerifiedStatus(prev => {
              const next = { ...prev };
              delete next[reconnectAccount.id];
              return next;
            });
          }
          qc.invalidateQueries(["social_accounts"]);
        }} />
    </div>
  );
}

// ── Calendar View Component ─────────────────────────────────────────────────
function CalendarView({ posts, platforms }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const postsInMonth = posts.filter(p => {
    if (!p.scheduled_at) return false;
    const d = new Date(p.scheduled_at);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const postsByDay = {};
  postsInMonth.forEach(p => {
    const day = new Date(p.scheduled_at).getDate();
    if (!postsByDay[day]) postsByDay[day] = [];
    postsByDay[day].push(p);
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground">{monthNames[month]} {year}</h3>
        <div className="flex gap-2">
          <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          const dayPosts = day ? (postsByDay[day] || []) : [];
          const isToday = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
          return (
            <div key={i} className={`min-h-[60px] rounded-xl p-1.5 border transition-all ${
              day ? (isToday ? "border-fuchsia-500/50 bg-fuchsia-500/5" : "border-border hover:border-fuchsia-500/20") : "border-transparent"
            }`}>
              {day && (
                <>
                  <div className={`text-xs font-bold mb-1 ${isToday ? "text-fuchsia-400" : "text-muted-foreground"}`}>{day}</div>
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 2).map(p => {
                      const plt = platforms.find(pl => pl.id === p.platform);
                      return (
                        <div key={p.id} className={`text-[9px] font-bold px-1 py-0.5 rounded truncate bg-gradient-to-r ${plt?.color || "from-gray-500 to-gray-700"} text-white`}>
                          {plt?.short} {p.caption?.slice(0, 12)}...
                        </div>
                      );
                    })}
                    {dayPosts.length > 2 && <div className="text-[9px] text-muted-foreground text-center">+{dayPosts.length - 2}</div>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
