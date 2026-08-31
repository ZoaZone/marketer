import { useEffect } from "react";
import { BRAND } from "@/lib/brand";
import { ALL_PLANS, FREE_TRIAL_GENERATIONS } from "@/config/plans";
import { PRICING_FAQ } from "@/config/faq";

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
      "One AI studio for creators, agencies, film studios and dubbing houses: ad creatives, campaigns, films built scene by scene, and dubbing into 22 languages.",
  },
  pricing: {
    path: "/pricing",
    title: "Pricing",
    description:
      "Plans for creators, agencies, studios and dubbing houses. AI content from $19/mo; per-scene video and 22-language dubbing from $99/mo. Yearly saves 20%.",
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
  terms: {
    path: "/terms",
    title: "Terms of Service",
    description: `The terms governing your use of ${BRAND.name}, operated by ZoaZone Services LLC — accounts, plans and billing, acceptable use, AI-generated content, and rights in what you upload.`,
  },
  freeTrial: {
    path: "/free-trial",
    title: "Start your free trial",
    description:
      `Try ${BRAND.name} free — ${FREE_TRIAL_GENERATIONS} AI generations covering images and voiceover, enough to take a short narrated video end to end. No credit card required.`,
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

/**
 * JSON-LD. Injected once; safe to call repeatedly.
 *
 * The price range and plan count are derived from the canonical catalog.
 * They were hardcoded as highPrice "499" / offerCount "8", which stopped
 * being true the moment Enterprise ($1,499) became a real plan — and Google
 * surfaces price ranges in rich results, so a stale number here is wrong
 * data shown to searchers, not just an internal tidiness problem.
 *
 * The FAQ block reuses the exact text rendered by PricingFAQ (both read
 * src/config/faq.js). Google requires FAQPage markup to match visible page
 * content; emitting answers the page does not show risks a manual action.
 */
export function injectStructuredData() {
  const id = "ds-structured-data";
  if (document.getElementById(id)) return;

  const prices = ALL_PLANS.map((p) => p.price_monthly).filter((n) => n > 0);

  const app = {
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
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offerCount: String(ALL_PLANS.length),
      url: `${SITE_URL}/pricing`,
    },
    publisher: {
      "@type": "Organization",
      name: "ZoaZone Services LLC",
      url: SITE_URL,
      logo: `${SITE_URL}/brand/lockup-h.png`,
      email: "care@digitalstudios.app",
      address: {
        "@type": "PostalAddress",
        streetAddress: "1770 Grand Concourse 12A",
        addressLocality: "Bronx",
        addressRegion: "NY",
        postalCode: "10457",
        addressCountry: "US",
      },
    },
    featureList: [
      "AI movie maker — build a film scene by scene with generated footage",
      "Commercial dubbing into 22 languages, preserving voice, tone and background score",
      "Lip-sync for dubbed footage",
      "AI song and music generation",
      "AI image generation with reference character and style",
      "Ad creatives, social scheduling, funnels and bulk messaging",
      "Multi-brand agency workspaces and white-label client portals",
      "Bring your own Replicate, ElevenLabs or LLM provider keys",
    ],
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PRICING_FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.id = id;
  s.textContent = JSON.stringify([app, faq]);
  document.head.appendChild(s);
}
