import { useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import {
  Music, Sparkles, Lock, Loader2, Check, AlertCircle, X,
  Save, Download, Globe, Mic2, RefreshCw,
  Languages, ListMusic,
} from "lucide-react";
import { generateText, generateVoiceover, generateMusic, uploadFile } from "@/utils/aiClient";
import PageHeader from "@/components/ui/PageHeader";

// Strip markdown symbols & section brackets before sending to TTS
function toSpeakableText(text) {
  return (text || "")
    .replace(/\*\*/g, "").replace(/\*/g, "")     // bold/italic markers
    .replace(/#{1,6}\s*/g, "")                   // headings
    .replace(/\[([^\]]+)\]/g, "")                // section labels like [VERSE 1]
    .replace(/^\s*[-•]\s/gm, "")                 // bullet points
    .replace(/`[^`]*`/g, "")                     // inline code
    .replace(/\n{3,}/g, "\n\n")                  // excessive blank lines
    .trim();
}

const LANGUAGES = [
  "English", "Spanish", "French", "German", "Portuguese", "Hindi", "Arabic",
  "Japanese", "Korean", "Chinese (Mandarin)", "Italian", "Russian", "Tamil",
  "Telugu", "Bengali", "Turkish", "Dutch", "Polish", "Vietnamese", "Thai",
];

const GENRES = [
  "Pop", "R&B", "Hip-Hop", "Rock", "Jazz", "Classical", "Electronic",
  "Country", "Folk", "Bollywood", "K-Pop", "Latin", "Gospel", "Reggae",
];

const MOODS = [
  "Uplifting", "Melancholic", "Romantic", "Energetic", "Calm", "Dramatic",
  "Playful", "Inspirational", "Dark", "Nostalgic",
];

const SONG_STRUCTURES = [
  { id: "verse-chorus", label: "Verse / Chorus / Bridge" },
  { id: "verse-only", label: "Verse Only" },
  { id: "freestyle", label: "Freestyle / Open" },
];

export default function SongCreator() {
  const { userTier, isAdmin } = useOutletContext();

  const [theme, setTheme] = useState("");
  const [genre, setGenre] = useState("Pop");
  const [mood, setMood] = useState("Uplifting");
  const [language, setLanguage] = useState("English");
  const [dubLanguage, setDubLanguage] = useState("");
  const [structure, setStructure] = useState("verse-chorus");
  const [customInstructions, setCustomInstructions] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [dubbedLyrics, setDubbedLyrics] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [dubbedAudioBlob, setDubbedAudioBlob] = useState(null);
  const [dubbedAudioUrl, setDubbedAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [dubbingLoading, setDubbingLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("compose"); // compose | dub | export

  if (userTier < 4 && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-600 flex items-center justify-center mx-auto shadow-lg shadow-violet-500/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-foreground">Song Creator</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Generate original song lyrics in any language, AI voiceover rendering, and automatic dubbing into other languages — exclusive to the Enterprise plan.
          </p>
          <Link to="/billing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/25 hover:opacity-90 transition-opacity">
            <Sparkles className="w-4 h-4" /> Upgrade to Enterprise
          </Link>
        </div>
      </div>
    );
  }

  const generateLyrics = async () => {
    if (!theme.trim()) return setError("Enter a theme or topic for your song.");
    setLoading(true);
    setError("");
    try {
      const structureDesc = {
        "verse-chorus": "with Verse 1, Pre-Chorus, Chorus, Verse 2, Bridge, and Outro sections",
        "verse-only": "as flowing verses without a repeating chorus",
        "freestyle": "as a freestyle with no fixed structure",
      }[structure];
      const result = await generateText({
        type: "script",
        prompt: `Write original song lyrics in ${language} ${structureDesc}. Genre: ${genre}. Mood: ${mood}. Theme: "${theme}".${customInstructions ? ` Additional notes: ${customInstructions}` : ""} Format each section clearly with [VERSE 1], [CHORUS], [BRIDGE] etc labels. Make the lyrics creative, authentic, and emotionally resonant.`,
        tone: mood,
      });
      setLyrics(result);
      setDubbedLyrics("");
      setAudioUrl(""); setAudioBlob(null);
      setDubbedAudioUrl(""); setDubbedAudioBlob(null);
    } catch (e) {
      setError(e?.message || "Lyrics generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const generateAudio = async (text, onUrl) => {
    if (!text?.trim()) return setError("Generate lyrics first.");
    setVoiceLoading(true);
    setError("");
    try {
      // 20000 matches generateVoiceover's real cap (ElevenLabs TTS) — the
      // old 2000-char slice was a leftover from the previous Google
      // Translate TTS backend's much lower limit.
      const blob = await generateVoiceover(toSpeakableText(text).slice(0, 20000));
      if (blob) {
        const url = URL.createObjectURL(blob);
        onUrl(url, blob);
      } else {
        setError("Audio generation unavailable. Try again later.");
      }
    } catch (e) {
      setError(e?.message || "Audio generation failed.");
    } finally {
      setVoiceLoading(false);
    }
  };

  // "Sung / Full song" — generates real music with vocals from the lyrics,
  // as opposed to generateAudio's plain spoken-word TTS reading. Writes into
  // the same audioUrl/audioBlob state as the spoken flow so it reuses the
  // existing audio player and Save-to-Library wiring below.
  const generateSong = async () => {
    if (!lyrics.trim()) return setError("Generate lyrics first.");
    setSongLoading(true);
    setError("");
    try {
      // generateMusic now runs as an async job on the render worker and
      // returns a persistent URL directly (already uploaded to Base44
      // storage) — unlike the spoken-TTS path below, there's no local
      // Blob to track for this one.
      const url = await generateMusic({
        prompt: theme,
        lyrics: toSpeakableText(lyrics),
        instrumental: false,
        genre,
        mood,
        durationSeconds: 60,
      });
      if (url) {
        setAudioUrl(url);
        setAudioBlob(null);
      } else {
        setError("Song generation unavailable. Try again later.");
      }
    } catch (e) {
      setError(e?.message || "Song generation failed.");
    } finally {
      setSongLoading(false);
    }
  };

  const handleDubbing = async () => {
    if (!lyrics) return setError("Generate lyrics first.");
    if (!dubLanguage) return setError("Select a target language for dubbing.");
    setDubbingLoading(true);
    setError("");
    try {
      const translated = await generateText({
        type: "script",
        prompt: `Translate these song lyrics from ${language} to ${dubLanguage}. Preserve the rhyme scheme, meter, and emotional tone as closely as possible. Keep the same section labels ([VERSE 1], [CHORUS] etc). Lyrics:\n\n${lyrics}`,
        tone: mood,
      });
      setDubbedLyrics(translated);
      setDubbedAudioUrl(""); setDubbedAudioBlob(null);
    } catch (e) {
      setError(e?.message || "Translation failed.");
    } finally {
      setDubbingLoading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    setLoading(true);
    setError("");
    try {
      // audioUrl/dubbedAudioUrl from the spoken-TTS path are blob: URLs
      // (URL.createObjectURL), only valid in this browser tab — persist the
      // actual audio via uploadFile first so ContentAsset.file_url is a
      // real, durable link, not a reference that's already dead by the
      // next page load. The "Sung / Full song" path is different: it comes
      // back from the async music-generation job as an already-persistent
      // URL (the worker uploads it to Base44 itself), so there's no blob
      // to upload — just use that URL directly.
      const blobToSave = dubbedAudioBlob || audioBlob;
      const urlToSave = dubbedAudioUrl || audioUrl;
      let file_url;
      if (blobToSave) {
        const filename = `${(theme || "song").trim().replace(/[^\w\-]+/g, "_") || "song"}.mp3`;
        file_url = await uploadFile(new File([blobToSave], filename, { type: blobToSave.type || "audio/mpeg" }));
        if (!file_url) {
          setError("Audio upload failed — nothing was saved. Please try again.");
          setLoading(false);
          return;
        }
      } else if (urlToSave && !urlToSave.startsWith("blob:")) {
        file_url = urlToSave;
      }
      await base44.entities.ContentAsset.create({
        ...mine(),
        title: `${genre} Song — ${theme.slice(0, 40) || "Untitled"}`,
        type: "script",
        content: dubbedLyrics ? `[${language}]\n${lyrics}\n\n[${dubLanguage}]\n${dubbedLyrics}` : lyrics,
        file_url,
        ai_generated: true,
        prompt_used: `${genre} | ${mood} | ${language} | ${theme}`,
        status: "ready",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e?.message || "Save failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: "compose", label: "Compose", icon: ListMusic },
    { id: "dub", label: "Dub & Translate", icon: Languages },
    { id: "export", label: "Export", icon: Download },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <PageHeader
          icon={Music}
          iconGradient="from-violet-500 to-pink-600"
          title="Song Creator"
          subtitle="AI lyrics, voiceover rendering, and multilingual dubbing"
        />

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl bg-card border border-border">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === t.id ? "bg-violet-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            <button onClick={() => setError("")} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Compose tab */}
        {tab === "compose" && (
          <div className="grid md:grid-cols-[1fr_380px] gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Song theme / topic</label>
                <input value={theme} onChange={e => setTheme(e.target.value)}
                  placeholder="e.g. Overcoming heartbreak, rising from failure, summer love..."
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/50 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Genre</label>
                  <select value={genre} onChange={e => setGenre(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-violet-500/50 transition-colors">
                    {GENRES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Mood</label>
                  <select value={mood} onChange={e => setMood(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-violet-500/50 transition-colors">
                    {MOODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-violet-500/50 transition-colors">
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Song structure</label>
                <div className="flex gap-2 flex-wrap">
                  {SONG_STRUCTURES.map(s => (
                    <button key={s.id} onClick={() => setStructure(s.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        structure === s.id
                          ? "border-violet-500 bg-violet-500/10 text-violet-400"
                          : "border-border bg-card text-muted-foreground hover:border-violet-500/40 hover:text-foreground"
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Additional instructions (optional)</label>
                <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Include a key change in the bridge, reference rain as a metaphor, use AABB rhyme scheme..."
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/50 transition-colors resize-none" />
              </div>
              <button onClick={generateLyrics} disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/25 hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "Writing lyrics…" : "Generate Lyrics"}
              </button>
            </div>

            {/* Lyrics + audio */}
            <div className="space-y-4">
              {lyrics ? (
                <>
                  <div className="p-4 rounded-xl bg-card border border-border h-80 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground">Lyrics — {language}</p>
                      <button onClick={generateLyrics} disabled={loading}
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea value={lyrics} onChange={e => setLyrics(e.target.value)}
                      className="w-full h-full text-sm text-foreground bg-transparent focus:outline-none resize-none leading-relaxed" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => generateAudio(lyrics, (url, blob) => { setAudioUrl(url); setAudioBlob(blob); })} disabled={voiceLoading || songLoading}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-semibold hover:bg-violet-500/20 transition-all disabled:opacity-50">
                      {voiceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic2 className="w-4 h-4" />}
                      {voiceLoading ? "Rendering…" : "Spoken (no music)"}
                    </button>
                    <button onClick={generateSong} disabled={voiceLoading || songLoading}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50">
                      {songLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                      {songLoading ? "Composing…" : "Sung / Full song"}
                    </button>
                  </div>
                  {audioUrl && (
                    <div className="p-3 rounded-xl bg-card border border-border">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Audio — {language}</p>
                      <audio controls src={audioUrl} className="w-full" />
                    </div>
                  )}
                </>
              ) : (
                <div className="h-80 rounded-2xl border border-dashed border-border flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <Music className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs text-muted-foreground">Lyrics appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dub & Translate tab */}
        {tab === "dub" && (
          <div className="space-y-4">
            {!lyrics ? (
              <div className="text-center py-10 space-y-2">
                <Globe className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-semibold text-foreground">No lyrics yet</p>
                <p className="text-xs text-muted-foreground">Go to Compose and generate lyrics first.</p>
                <button onClick={() => setTab("compose")}
                  className="px-4 py-2 rounded-xl bg-card border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Go to Compose →
                </button>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Original — {language}</p>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-line line-clamp-12">{lyrics}</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Dub into language</label>
                      <select value={dubLanguage} onChange={e => setDubLanguage(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-violet-500/50 transition-colors">
                        <option value="">Select target language…</option>
                        {LANGUAGES.filter(l => l !== language).map(l => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <button onClick={handleDubbing} disabled={dubbingLoading || !dubLanguage}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                      {dubbingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                      {dubbingLoading ? "Translating…" : "Translate & Adapt Lyrics"}
                    </button>
                  </div>
                </div>
                {dubbedLyrics && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-card border border-border max-h-64 overflow-y-auto">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Dubbed lyrics — {dubLanguage}</p>
                      <textarea value={dubbedLyrics} onChange={e => setDubbedLyrics(e.target.value)}
                        className="w-full text-sm text-foreground bg-transparent focus:outline-none resize-none leading-relaxed" rows={10} />
                    </div>
                    <button onClick={() => generateAudio(dubbedLyrics, (url, blob) => { setDubbedAudioUrl(url); setDubbedAudioBlob(blob); })} disabled={voiceLoading}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-semibold hover:bg-violet-500/20 transition-all disabled:opacity-50">
                      {voiceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic2 className="w-4 h-4" />}
                      {dubbedAudioUrl ? "Re-render Dubbed Audio" : "Render Dubbed AI Voiceover"}
                    </button>
                    {dubbedAudioUrl && (
                      <div className="p-3 rounded-xl bg-card border border-border">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">AI Voiceover — {dubLanguage}</p>
                        <audio controls src={dubbedAudioUrl} className="w-full" />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Export tab */}
        {tab === "export" && (
          <div className="space-y-4">
            {!lyrics ? (
              <p className="text-xs text-muted-foreground text-center py-6">Generate lyrics first in the Compose tab.</p>
            ) : (
              <>
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <p className="text-sm font-semibold text-foreground">Song summary</p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><span className="text-foreground font-medium">Theme:</span> {theme}</p>
                    <p><span className="text-foreground font-medium">Genre / Mood:</span> {genre} — {mood}</p>
                    <p><span className="text-foreground font-medium">Language:</span> {language}{dubLanguage ? ` + dubbed in ${dubLanguage}` : ""}</p>
                    <p><span className="text-foreground font-medium">Lyrics:</span> {lyrics.split(/\s+/).length} words</p>
                  </div>
                </div>
                {(audioUrl || dubbedAudioUrl) && (
                  <div className="space-y-3">
                    {audioUrl && (
                      <div className="p-3 rounded-xl bg-card border border-border">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Original ({language})</p>
                        <audio controls src={audioUrl} className="w-full" />
                        <a href={audioUrl} download className="inline-flex items-center gap-1.5 mt-2 text-xs text-violet-400 hover:underline">
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                    )}
                    {dubbedAudioUrl && (
                      <div className="p-3 rounded-xl bg-card border border-border">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Dubbed ({dubLanguage})</p>
                        <audio controls src={dubbedAudioUrl} className="w-full" />
                        <a href={dubbedAudioUrl} download className="inline-flex items-center gap-1.5 mt-2 text-xs text-violet-400 hover:underline">
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={handleSaveToLibrary} disabled={loading || saved}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/25 hover:opacity-90 transition-opacity disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved ? "Saved to Library!" : loading ? "Saving…" : "Save Lyrics & Audio to Library"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
