import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { uploadFile } from "@/utils/lane1";

// One shared "brand kit" for Quick Video, Quick Create and Movie Maker: the
// chosen brand (read from the Brand entity) plus any extra reference media /
// logos. Persisted in this browser so the user is never asked again, in any
// of the three tools.
const KEY = "ds_brand_kit_v1";

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
};

export default function useBrandKit() {
  const [state, setState] = useState(() => ({ brandId: "", refs: [], ...load() }));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["brand_kit_brands"],
    queryFn: async () => (await base44.entities.Brand.filter({ is_active: true }, { sort: "-created_date", limit: 50 })).items || [],
  });

  const update = useCallback((patch) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  // "" = automatic (first brand), "none" = deliberately no brand.
  const brand = state.brandId === "none" ? null
    : brands.find(b => b.id === state.brandId) || (state.brandId ? null : brands[0] || null);

  const addFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true); setError("");
    try {
      const added = [];
      for (const file of Array.from(files)) {
        const url = await uploadFile(file);
        if (url) added.push({ url, name: file.name, type: file.type?.startsWith("video") ? "video" : "image" });
      }
      update({ refs: [...state.refs, ...added] });
    } catch (e) { setError(e?.message || "Upload failed."); }
    setUploading(false);
  };
  const addLibrary = (items) => update({
    refs: [...state.refs, ...items.map(a => ({ url: a.file_url, name: a.title || "Library media", type: a.type === "video" ? "video" : "image" }))],
  });
  const removeRef = (i) => update({ refs: state.refs.filter((_, j) => j !== i) });

  const derived = useMemo(() => {
    const logo = brand?.logo_file_url || brand?.logo_url || "";
    const parts = brand ? [
      `Brand "${brand.name}"`,
      brand.tagline && `tagline "${brand.tagline}"`,
      brand.industry && `industry: ${brand.industry}`,
      brand.brand_voice && `brand voice/tone: ${brand.brand_voice}`,
      brand.target_audience && `target audience: ${brand.target_audience}`,
      `brand colors: ${[brand.primary_color, brand.secondary_color, brand.accent_color].filter(Boolean).join(", ")}`,
      brand.website && `website: ${brand.website}`,
    ].filter(Boolean) : [];
    const brief = parts.join("; ");
    const imageRefs = state.refs.filter(r => r.type !== "video").map(r => r.url);
    const videoNotes = state.refs.filter(r => r.type === "video").map(r => r.name);
    const full = [brief, videoNotes.length && `match the motion/style of reference video(s): ${videoNotes.join(", ")}`,
      (logo || imageRefs.length) && "use the supplied logo / reference pictures as visual references"].filter(Boolean).join("; ");
    return {
      logo, imageRefs, brief: full,
      voice: brand?.brand_voice || "",
      look: brand ? `Brand look: palette ${[brand.primary_color, brand.secondary_color, brand.accent_color].filter(Boolean).join(", ")}.` : "",
      imageUrls: [logo, ...imageRefs].filter(Boolean),
    };
  }, [brand, state.refs]);

  const withBrand = (text) => derived.brief ? `${text}\n\nBrand guidelines (apply automatically, do not ask): ${derived.brief}.` : text;

  return {
    brands, brand, isLoading, brandId: state.brandId, setBrandId: (id) => update({ brandId: id }),
    refs: state.refs, addFiles, addLibrary, removeRef, uploading, error, withBrand, ...derived,
  };
}