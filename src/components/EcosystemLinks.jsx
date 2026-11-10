import React from "react";

/**
 * Cross-promotion widget for the Medha.io / Zoa Zone ecosystem of apps.
 * Renders every sibling app (excluding the current one, via `selfKey`)
 * as a compact grid of name + one-line description + link.
 *
 * `onMedha` picks which domain variant to link to for each sibling app:
 * the native domain when false, the .medha.io domain when true.
 */

const ECOSYSTEM_APPS = [
  {
    key: "aeva",
    name: "AEVA",
    description: "AI agent workspace for building and running autonomous workflows.",
    nativeDomain: "ai.workautomation.app",
    medhaDomain: "ai.medha.io",
  },
  {
    key: "flowsync",
    name: "FlowSync",
    description: "Workflow automation and process orchestration for growing teams.",
    nativeDomain: "workautomation.app",
    medhaDomain: "automate.medha.io",
  },
  {
    key: "digitalstudio",
    name: "Digital Studio",
    description: "Creative and content production studio powered by AI.",
    nativeDomain: "digitalstudios.app",
    medhaDomain: "chitra.medha.io",
  },
  {
    key: "aevoice",
    name: "AEVOICE",
    description: "Voice AI agents for calls, support, and conversational automation.",
    nativeDomain: "aevoice.ai",
    medhaDomain: "televaani.medha.io",
  },
  {
    key: "healthai",
    name: "HealthAI",
    description: "AI-assisted health and wellness management platform.",
    nativeDomain: "health.workautomation.app",
    medhaDomain: "med.medha.io",
  },
  {
    key: "vetconnect",
    name: "VetConnect",
    description: "Practice management and client engagement for veterinary clinics.",
    nativeDomain: "vet.workautomation.app",
    medhaDomain: "vet.medha.io",
  },
  {
    key: "hellobiz",
    name: "HelloBiz",
    description: "Marketing, outreach, and customer engagement for small businesses.",
    nativeDomain: "hellobiz.app",
    medhaDomain: "market.medha.io",
  },
  {
    key: "sreeos",
    name: "Sree OS",
    description: "AI-native operating layer for coordinating agents and services.",
    nativeDomain: "os.aevoice.ai",
    medhaDomain: "code.medha.io",
  },
  {
    key: "payroll",
    name: "Payroll & Billing",
    description: "Payroll processing and billing automation across the ecosystem.",
    nativeDomain: "pay.hellobiz.app",
    medhaDomain: "pay.medha.io",
  },
];

export default function EcosystemLinks({ selfKey, onMedha }) {
  const apps = ECOSYSTEM_APPS.filter((app) => app.key !== selfKey);

  if (apps.length === 0) return null;

  return (
    <div className="border-t border-white/10 pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Explore the Medha.io Ecosystem
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {apps.map((app) => {
          const domain = onMedha ? app.medhaDomain : app.nativeDomain;
          const href = `https://${domain}`;
          return (
            <a
              key={app.key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-white/10 px-3 py-2 text-left transition-colors hover:border-white/30 hover:bg-white/5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200 group-hover:text-white">
                  {app.name}
                </span>
                <span className="text-[10px] text-neutral-500">{domain}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-neutral-400">
                {app.description}
              </p>
            </a>
          );
        })}
      </div>
    </div>
  );
}
