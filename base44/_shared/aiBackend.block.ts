// aiBackend.block.ts — platform-wide / per-section LLM backend selection.
//
// ⚠️ DEPRECATED LOCATION — DO NOT IMPORT THIS FILE.
// Base44 Edge Functions cannot import a relative module from outside their
// own function directory unless it lives under a top-level `shared/` folder
// (no leading underscore) — this file's only importer (generateMediaContent)
// failed to bundle/deploy with "Relative imports can't reach outside the
// function" (discovered Nov 2026) and was removed rather than fixed, since
// its PlatformAiConfig admin-override feature was never actually configured
// (always resolved to a no-op). If this per-section backend-override feature
// is wanted again, move this file to base44/shared/aiBackend.block.ts first
// and import it from there.
//
// Why this exists
// ---------------
// Every LLM call used to fall through to `base44.integrations.Core.InvokeLLM`,
// which spends Base44 integration credits. The platform owner wants to run
// those same generations on their OWN provider keys (OpenAI / Anthropic / any
// OpenAI-compatible endpoint) so integration credits stay reserved for
// internal and future use — and wants to choose that per section
// ("capture", "video", "marketing", "whatsapp", ...) rather than only
// globally, because some sections are worth a platform model and some are not.
//
// Resolution order (first hit wins)
// ---------------------------------
//   1. PlatformAiConfig.section_overrides entry matching the caller's section
//   2. PlatformAiConfig.default_backend / default_model / default_base_url
//   3. "platform" — Base44 built-in AI (existing behaviour, spends credits)
//
// A user's own BYOK key (Account > Integrations) still takes priority over
// everything above when the caller's plan entitles them to it; this resolver
// deliberately does not touch that path, so BYOK keeps working exactly as it
// did. `resolvePlatformBackend()` answers only the platform-level question.
//
// Provider keys are read from env, never from the entity: the entity stores
// only WHICH backend to use, so a config row can be edited by an admin
// without ever handling a secret.

export type AiBackend = "platform" | "openai" | "anthropic" | "custom";

/**
 * Model ids verified against the account's live provider keys (Nov 2026).
 * A PlatformAiConfig row should use one of these; anything else is passed
 * through as-is and will surface the provider's own error.
 *   anthropic: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929,
 *              claude-sonnet-4-6, claude-opus-4-5-20251101, claude-sonnet-5,
 *              claude-opus-5, claude-haiku-5-5
 * NOTE: the OPENAI_API_KEY currently on file returns 401 (revoked) — set a
 * fresh key before switching a section to the "openai" backend.
 */
export const VERIFIED_MODELS: Record<string, string[]> = {
  anthropic: [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "claude-opus-4-5-20251101",
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-haiku-5-5",
  ],
  openai: ["gpt-4o-mini", "gpt-4o"],
};

export interface ResolvedBackend {
  /** Which backend to actually call. */
  backend: AiBackend;
  /** Model id to send, if one was configured. */
  model?: string;
  /** Base URL for the `custom` backend. */
  baseUrl?: string;
  /** Env var name the API key is read from (undefined for `platform`). */
  apiKeyEnv?: string;
  /** Where this decision came from — surfaced for diagnostics, never secrets. */
  source: "section_override" | "platform_default" | "built_in";
}

const PROVIDER_KEY_ENV: Record<Exclude<AiBackend, "platform">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  custom: "CUSTOM_LLM_API_KEY",
};

const VALID_BACKENDS: AiBackend[] = ["platform", "openai", "anthropic", "custom"];

function coerceBackend(value: unknown, fallback: AiBackend): AiBackend {
  return VALID_BACKENDS.includes(value as AiBackend) ? (value as AiBackend) : fallback;
}

/**
 * Reads the single active PlatformAiConfig row. Returns null when the entity
 * is missing, empty, or the read fails — every caller treats that as "no
 * platform override configured" and keeps its previous behaviour, so this can
 * never break a deployment that has not adopted it yet.
 */
export async function loadPlatformAiConfig(base44: any): Promise<any | null> {
  try {
    const rows = await base44.asServiceRole.entities.PlatformAiConfig.list("-created_date", 5);
    const active = (rows || []).find((r: any) => r && r.active !== false);
    return active || null;
  } catch (_e) {
    // Entity not created yet, or RLS denied the service role — treat as unset.
    return null;
  }
}

/**
 * Decides which backend a given section should use.
 *
 * @param base44   a service-role-capable client
 * @param section  optional section key ("capture", "video", ...). Omit for the
 *                 platform default with no section consideration.
 */
export async function resolvePlatformBackend(base44: any, section?: string): Promise<ResolvedBackend> {
  const config = await loadPlatformAiConfig(base44);

  if (!config) {
    return { backend: "platform", source: "built_in" };
  }

  const wanted = String(section || "").trim().toLowerCase();
  if (wanted) {
    const overrides = Array.isArray(config.section_overrides) ? config.section_overrides : [];
    const match = overrides.find(
      (o: any) => o && String(o.section || "").trim().toLowerCase() === wanted
    );
    if (match) {
      const backend = coerceBackend(match.backend, "platform");
      return {
        backend,
        model: match.model || undefined,
        baseUrl: match.base_url || config.default_base_url || undefined,
        apiKeyEnv: backend === "platform" ? undefined : PROVIDER_KEY_ENV[backend],
        source: "section_override",
      };
    }
  }

  const backend = coerceBackend(config.default_backend, "platform");
  return {
    backend,
    model: config.default_model || undefined,
    baseUrl: config.default_base_url || undefined,
    apiKeyEnv: backend === "platform" ? undefined : PROVIDER_KEY_ENV[backend],
    source: backend === "platform" ? "built_in" : "platform_default",
  };
}

/**
 * Calls an OpenAI-compatible chat-completions endpoint. Used for `openai` and
 * `custom`; `anthropic` has its own message shape and is handled by the
 * caller. Throws on any non-2xx so the caller can fall back.
 */
export async function callOpenAiCompatible(opts: {
  prompt: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  system?: string;
}): Promise<string> {
  const base = (opts.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || "gpt-4o-mini",
      messages,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI-compatible request failed: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI-compatible endpoint returned no content.");
  return text;
}

/** Calls Anthropic's messages endpoint. Throws on any non-2xx. */
export async function callAnthropic(opts: {
  prompt: string;
  apiKey: string;
  model?: string;
  system?: string;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model || "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic request failed: ${await res.text()}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Anthropic returned no content.");
  return text;
}

/**
 * Runs one generation on the resolved platform backend.
 *
 * Returns null when the resolved backend is `platform` (the caller then uses
 * its existing Base44 Core.InvokeLLM path) OR when the provider call fails —
 * in both cases the caller falls back, so a misconfigured platform key
 * degrades to the old behaviour instead of breaking generation outright.
 */
export async function tryPlatformBackend(
  base44: any,
  opts: { section?: string; prompt: string; system?: string; modelOverride?: string }
): Promise<{ text: string; backend: AiBackend; model?: string } | null> {
  const resolved = await resolvePlatformBackend(base44, opts.section);
  if (resolved.backend === "platform") return null;

  const envName = resolved.apiKeyEnv;
  const apiKey = envName ? Deno.env.get(envName) : undefined;
  if (!apiKey) {
    // Configured to use a provider but its key isn't set — fall back rather
    // than failing the whole generation.
    console.warn(`[ai-backend] ${resolved.backend} selected but ${envName} is not set — falling back to platform AI.`);
    return null;
  }

  const model = opts.modelOverride || resolved.model;

  try {
    const text = resolved.backend === "anthropic"
      ? await callAnthropic({ prompt: opts.prompt, apiKey, model, system: opts.system })
      : await callOpenAiCompatible({
          prompt: opts.prompt,
          apiKey,
          baseUrl: resolved.baseUrl,
          model,
          system: opts.system,
        });
    return { text, backend: resolved.backend, model };
  } catch (e) {
    console.warn(`[ai-backend] ${resolved.backend} call failed (${(e as Error).message}) — falling back to platform AI.`);
    return null;
  }
}
