import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Share2, Plus, Calendar, Clock, CheckCircle2, XCircle, Loader2,
  X, Send, ExternalLink, AlertCircle, RefreshCw, Trash2
} from "lucide-react";

const PLATFORMS = [
  { id: "instagram",  label: "Instagram",  color: "from-pink-500 to-rose-600" },
  { id: "facebook",   label: "Facebook",   color: "from-blue-500 to-blue-700" },
  { id: "tiktok",     label: "TikTok",     color: "from-gray-800 to-gray-900" },
  { id: "linkedin",   label: "LinkedIn",   color: "from-blue-600 to-blue-800" },
  { id: "youtube",    label: "YouTube",    color: "from-red-500 to-red-700" },
  { id: "twitter_x",  label: "Twitter/X",  color: "from-gray-700 to-gray-900" },
];

const STATUS_COLORS = {
  scheduled: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  posted:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  draft:     "bg-muted text-muted-foreground border-border",
  failed:    "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUS_ICONS = {
  scheduled: <Clock className="w-3 h-3" />,
  posted:    <CheckCircle2 className="w-3 h-3" />,
  draft:     <AlertCircle className="w-3 h-3" />,
  failed:    <XCircle className="w-3 h-3" />,
};

export default function SocialHub() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [showCompose, setShowCompose] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    social_account_id: "",
    platform: "instagram",
    caption: "",
    media_url: "",
    media_type: "image",
    scheduled_at: "",
  });
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState(null); // post id being published
  const [publishError, setPublishError] = useState({}); // { [postId]: errorMsg }

  // Only load this user's social accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["social_accounts"],
    queryFn: () => base44.entities.SocialAccount.list("-created_date", 50),
  });

  // Only this user's posts (Base44 RLS scopes by created_by automatically)
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["scheduled_posts"],
    queryFn: () => base44.entities.ScheduledPost.list("-scheduled_at", 200),
  });

  // Filter posts
  const filtered = posts.filter(p => {
    const matchPlatform = platformFilter === "all" || p.platform === platformFilter;
    const matchStatus  = statusFilter  === "all" || p.status  === statusFilter;
    return matchPlatform && matchStatus;
  });

  // Auto-pick account when platform changes
  const autoPickAccount = (platform) => {
    const match = accounts.find(a => a.platform === platform);
    return match?.id || "";
  };

  const handlePlatformChange = (platform) => {
    setForm(f => ({ ...f, platform, social_account_id: autoPickAccount(platform) }));
  };

  // Available accounts for selected platform
  const platformAccounts = accounts.filter(a => a.platform === form.platform);

  const savePost = async () => {
    if (!form.caption.trim()) { alert("Caption is required"); return; }
    setSaving(true);
    try {
      const status = form.scheduled_at ? "scheduled" : "draft";
      await base44.entities.ScheduledPost.create({ ...form, status });
      qc.invalidateQueries(["scheduled_posts"]);
      setForm({ social_account_id: "", platform: "instagram", caption: "", media_url: "", media_type: "image", scheduled_at: "" });
      setShowCompose(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  // Publish a single post on demand
  const publishPost = async (post) => {
    setPublishingId(post.id);
    setPublishError(prev => ({ ...prev, [post.id]: null }));
    try {
      const res = await base44.functions.publishScheduledPosts({ post_id: post.id });
      if (res.failed > 0 && res.results?.[0]?.error) {
        setPublishError(prev => ({ ...prev, [post.id]: res.results[0].error }));
      }
      qc.invalidateQueries(["scheduled_posts"]);
    } catch (e) {
      setPublishError(prev => ({ ...prev, [post.id]: e.message }));
    }
    setPublishingId(null);
  };

  // Publish ALL due scheduled posts (user clicks "Publish Due Posts")
  const publishAllDue = async () => {
    setPublishingId("all");
    try {
      await base44.functions.publishScheduledPosts({});
      qc.invalidateQueries(["scheduled_posts"]);
    } catch (e) { alert(e.message); }
    setPublishingId(null);
  };

  const deletePost = async (postId) => {
    if (!confirm("Delete this post?")) return;
    await base44.entities.ScheduledPost.delete(postId);
    qc.invalidateQueries(["scheduled_posts"]);
  };

  const connectedPlatforms = [...new Set(accounts.map(a => a.platform))];
  const scheduledCount = posts.filter(p => p.status === "scheduled").length;
  const postedCount   = posts.filter(p => p.status === "posted").length;
  const dueCount      = posts.filter(p => p.status === "scheduled" && p.scheduled_at && new Date(p.scheduled_at) <= new Date()).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Share2 className="w-6 h-6 text-fuchsia-400" /> Social Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Schedule and publish posts with your own social accounts
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {dueCount > 0 && (
            <button
              onClick={publishAllDue}
              disabled={publishingId === "all"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/25 transition-all"
            >
              {publishingId === "all"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Publish Due ({dueCount})
            </button>
          )}
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20"
          >
            <Plus className="w-4 h-4" /> New Post
          </button>
        </div>
      </div>

      {/* No accounts warning */}
      {!accountsLoading && accounts.length === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">No social accounts connected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Go to <strong>Settings → Social Accounts</strong> to add your Instagram, Facebook, LinkedIn or other accounts before scheduling posts.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Posts",         value: posts.length },
          { label: "Scheduled",           value: scheduledCount },
          { label: "Published",           value: postedCount },
          { label: "Connected Accounts",  value: accounts.length },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-2xl font-black text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Connected platforms */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-foreground mb-4">Your Connected Accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts yet. Add them in <strong>Settings → Social Accounts</strong>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {accounts.map(acc => {
              const platform = PLATFORMS.find(p => p.id === acc.platform);
              return (
                <div key={acc.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${platform?.color || "from-gray-500 to-gray-700"} flex items-center justify-center`}>
                    <span className="text-xs font-black text-white">{(acc.platform || "?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{acc.account_name || acc.platform}</p>
                    <p className="text-[10px] text-emerald-400">Connected</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1 flex-wrap">
          {["all", ...PLATFORMS.map(p => p.id)].map(f => (
            <button
              key={f}
              onClick={() => setPlatformFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                platformFilter === f
                  ? "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All Platforms" : f.replace("_", "/")}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {["all", "scheduled", "posted", "draft", "failed"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                statusFilter === s
                  ? "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All Status" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Posts list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Calendar className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-foreground font-medium">No posts found</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Compose your first post and choose when to publish it
            </p>
            <button
              onClick={() => setShowCompose(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold"
            >
              Create Post
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(post => {
              const platform = PLATFORMS.find(pl => pl.id === post.platform);
              const account  = accounts.find(a => a.id === post.social_account_id);
              const isDue    = post.status === "scheduled" && post.scheduled_at && new Date(post.scheduled_at) <= new Date();
              const isPublishing = publishingId === post.id;
              const errMsg   = publishError[post.id];

              return (
                <div key={post.id} className="px-5 py-4 hover:bg-muted/10">
                  <div className="flex items-center gap-4">
                    {/* Platform icon */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${platform?.color || "from-gray-500 to-gray-700"} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-xs font-black text-white">{(post.platform || "?")[0].toUpperCase()}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{post.caption || "No caption"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="capitalize">{post.platform?.replace("_", "/")}</span>
                        {account && <span>· @{account.account_name || account.platform}</span>}
                        {post.media_type && <span>· {post.media_type}</span>}
                        {post.scheduled_at && (
                          <span className="flex items-center gap-1">
                            · <Clock className="w-3 h-3" />
                            {new Date(post.scheduled_at).toLocaleString()}
                            {isDue && <span className="text-amber-400 font-medium ml-1">(due)</span>}
                          </span>
                        )}
                        {post.post_url && (
                          <a href={post.post_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-0.5 text-fuchsia-400 hover:underline">
                            · View post <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border flex-shrink-0 ${STATUS_COLORS[post.status] || "bg-muted text-muted-foreground border-border"}`}>
                      {STATUS_ICONS[post.status]}
                      {post.status}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Publish Now — for scheduled/draft/failed posts */}
                      {post.status !== "posted" && (
                        <button
                          onClick={() => publishPost(post)}
                          disabled={isPublishing}
                          title="Publish now"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        >
                          {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      )}
                      {post.status === "posted" && post.post_url && (
                        <a href={post.post_url} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-fuchsia-400 hover:bg-fuchsia-500/10 transition-colors" title="View live post">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => deletePost(post.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Error message row */}
                  {(errMsg || (post.status === "failed" && post.error_message)) && (
                    <div className="mt-2 ml-13 flex items-start gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{errMsg || post.error_message}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-foreground text-lg">Compose Post</h3>
              <button onClick={() => setShowCompose(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-4">
              {/* Platform picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePlatformChange(p.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                        form.platform === p.id
                          ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300"
                          : "border-border bg-muted/20 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-[9px] font-black text-white">{p.label[0]}</span>
                      </div>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account picker for selected platform */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Your Account</label>
                {platformAccounts.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-xs text-amber-300">
                      No {form.platform} account connected. Add one in <strong>Settings → Social Accounts</strong>.
                    </p>
                  </div>
                ) : (
                  <select
                    value={form.social_account_id}
                    onChange={e => setForm(f => ({ ...f, social_account_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Select account —</option>
                    {platformAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_name || acc.platform} {acc.username ? `(@${acc.username})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Caption */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Caption *</label>
                <textarea
                  value={form.caption}
                  onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                  rows={4}
                  placeholder="Write your caption… or use Media Studio to generate one"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right">{form.caption.length} chars</p>
              </div>

              {/* Media URL */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Media URL</label>
                  <input
                    type="url"
                    value={form.media_url}
                    onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))}
                    placeholder="https://..."
                    className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Media Type</label>
                  <select
                    value={form.media_type}
                    onChange={e => setForm(f => ({ ...f, media_type: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="reel">Reel</option>
                    <option value="story">Story</option>
                    <option value="carousel">Carousel</option>
                  </select>
                </div>
              </div>

              {/* Schedule time */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Schedule Date & Time</label>
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave empty to save as draft. You can publish manually from the list anytime.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowCompose(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={savePost}
                disabled={saving || !form.caption.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {form.scheduled_at ? "Schedule Post" : "Save as Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
