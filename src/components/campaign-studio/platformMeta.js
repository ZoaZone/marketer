// Shared platform display + repurposing metadata for the Studio's
// Preview and Repurpose steps.

export const PLATFORM_META = {
  instagram: { label: "Instagram", bg: "bg-pink-500/10 border-pink-500/30 text-pink-400" },
  facebook: { label: "Facebook", bg: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  tiktok: { label: "TikTok", bg: "bg-gray-500/10 border-gray-500/30 text-gray-300" },
  linkedin: { label: "LinkedIn", bg: "bg-sky-500/10 border-sky-500/30 text-sky-400" },
  youtube: { label: "YouTube", bg: "bg-red-500/10 border-red-500/30 text-red-400" },
  twitter_x: { label: "Twitter/X", bg: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300" },
  pinterest: { label: "Pinterest", bg: "bg-red-500/10 border-red-500/30 text-red-400" },
  whatsapp: { label: "WhatsApp", bg: "bg-green-500/10 border-green-500/30 text-green-400" },
  email: { label: "Email", bg: "bg-violet-500/10 border-violet-500/30 text-violet-400" },
};

// Preferred video aspect ratio per platform (keys of VIDEO_RATIOS in videoAssembler.js).
export const PLATFORM_RATIOS = {
  instagram: "4:5",
  facebook: "16:9",
  tiktok: "9:16",
  linkedin: "1:1",
  youtube: "16:9",
  twitter_x: "16:9",
  pinterest: "4:5",
};
