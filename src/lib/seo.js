import { useEffect } from "react";
import { BRAND } from "@/lib/brand";

// ─────────────────────────────────────────────────────────────────────────────
// SEO for a client-rendered SPA.
//
// index.html carries one static set of tags. Crawlers that execute JS (Google
// does) read the DOM after hydration, so updating the head per route is what
// makes individual pages rankable rather than every URL sharing the home page's
// description. React 18 does not hoist <title>/<meta> out of components (that
// landed in 19), and react-helmet is another dependency for something this
// small — so this is a plain imperative hook.
//
// NOTE: this is still client-side rendering. Crawlers that don't run JS (most
// social-preview scrapers, some AI crawlers) see only index.html's defaults.
// If link previews per page ever matter commercially, the real fix is
// pre-rendering those public routes at build time.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_URL = "https://digitalstudios.app";

const DEFAULT_IMAGE = `${SITE_URL}/brand/wordmark.png`;

/** Upsert a <meta> by name= or property=, creating it if absent. */
function setMeta(attr, key, value) {
  if (!value) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * useSeo({ title, description, path, image, noindex, type })
 *
 * `title` is the page-specific part; the brand suffix is appended here so every
 * page is consistent and no caller has to remember it. Keep descriptions
 * roughly 140-160 characters — Google truncates beyond that.
 */
export function useSeo({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  noindex = false,
  type = "website",
} = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${BRAND.name}` : `${BRAND.name} — ${BRAND.tagline}`;
    const url = path ? `${SITE_URL}${path}` : SITE_URL;

    document.title = fullTitle;

    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");

    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", type);
    setMeta("property", "og:image", image);
    setMeta("property", "og:site_name", BRAND.name);

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);

    // Canonical prevents the same content ranking under query-string variants
    // (referral codes, session_id from Stripe returns, utm_*).
    setLink("canonical", url);
  }, [title, description, path, image, noindex, type]);
}

/**
 * Page copy, kept in one place so descriptions can be reviewed together rather
 * than hunted across 44 files. Only public, indexable routes belong here —
 * everything behind auth is noindex and doesn't need a description.
 */
export const SEO = {
  home: {
    path: "/",
    title: null, // home uses the brand-first title form
    description:
      "Create feature-length AI movies with scenes, music, subtitles and dubbing. Generate images and songs, dub any video into any language, and run your marketing — one AI studio. Start free.",
  },
  pricing: {
    path: "/pricing",
    title: "Pricing",
    description:
      "Plans for creators, studios and agencies. AI video, music, image generation, dubbing and marketing tools from $19/mo. Annual billing saves 20%. Start free — no credit card.",
  },
  auth: {
    path: "/auth",
    title: "Sign in",
    description: `Sign in to ${BRAND.name} to create AI movies, songs and campaigns.`,
    noindex: true, // auth pages have no search value and can leak return URLs
  },
  privacy: {
    path: "/privacy",
    title: "Privacy Policy",
    description: `How ${BRAND.name} collects, uses, stores and protects your data, including AI-generated content, connected social accounts and payment information.`,
  },
  freeTrial: {
    path: "/free-trial",
    title: "Start your free trial",
    description:
      "Try the full AI creative studio free for 14 days — AI video, song creation, image generation and dubbing. No credit card required to start.",
  },
  beta: {
    path: "/beta",
    title: "Request beta access",
    description: `Request early access to ${BRAND.name}'s newest AI video and dubbing features before general release.`,
  },
  agentProgram: {
    path: "/agent-program",
    title: "Partner & agent program",
    description:
      "Earn recurring commission reselling an AI creative platform. Two-tier affiliate structure, transparent payouts, and full agency tooling for client work.",
  },
  agencyEnquiry: {
    path: "/agency-enquiry",
    title: "Agency enquiry",
    description:
      "Managing content for multiple brands? Talk to us about multi-client accounts, white-label delivery and volume pricing for agencies.",
  },
  helpCenter: {
    path: "/help",
    title: "Help Center",
    description: `Guides and answers for ${BRAND.name} — connecting social accounts, generating AI video and music, dubbing, billing and troubleshooting.`,
    noindex: true, // lives behind the app shell
  },
};

/** JSON-LD for the home page. Injected once; safe to call repeatedly. */
export function injectStructuredData() {
  const id = "ds-structured-data";
  if (document.getElementById(id)) return;
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND.name,
    url: SITE_URL,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    description: SEO.home.description,
    image: DEFAULT_IMAGE,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "19",
      highPrice: "499",
      offerCount: "8",
    },
    featureList: [
      "AI movie maker with scenes, music and subtitles",
      "AI song and music generation",
      "Video dubbing into any language with voice preservation",
      "AI image generation with reference character and style",
      "Social scheduling, funnels and bulk messaging",
    ],
  };
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.id = id;
  s.textContent = JSON.stringify(data);
  document.head.appendChild(s);
}
