// Single source of truth for the product's name/domain/tagline — use this
// instead of hardcoding "DigitalStudios.app"/"Marketing OS"/etc. wherever
// the brand needs to appear (sidebar header, page chrome, footer, copy).
//
// chitra.medha.io is a white-labeled storefront of this same app/database
// (part of the Medha.io ecosystem, operated by Zoa Zone Digi Tech Pvt Ltd).
// Every consumer of BRAND.name/domain/tagline picks up the "Chitra" identity
// automatically on that host; every other hostname is unaffected.
const ON_MEDHA = typeof window !== "undefined" && window.location.hostname === "chitra.medha.io";

export const BRAND = ON_MEDHA ? {
  name: "Chitra",
  domain: "chitra.medha.io",
  tagline: "The AI creative platform for every creator",
} : {
  name: "Digital Studio",
  domain: "digitalstudios.app",
  tagline: "The AI creative platform for every creator",
};
