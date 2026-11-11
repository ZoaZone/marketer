import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * Cross-promotion + live app-switcher widget for the Medha.io / Zoa Zone
 * ecosystem of apps. See EcosystemLinks.jsx in the other ecosystem apps for
 * the same pattern. Falls back to static marketing links if the visitor
 * isn't signed in or has no active ecosystem plan.
 *
 * `compact` collapses the grid behind a single toggle row (arrow + label),
 * closed by default — use this on authenticated/dashboard pages; marketing
 * pages should leave it off so the grid is visible right away.
 */

const ECOSYSTEM_APPS = [
  { key: "aeva", appCode: "AEVA", name: "AEVA", description: "AI agent workspace for building and running autonomous workflows.", nativeDomain: "ai.workautomation.app", medhaDomain: "ai.medha.io" },
  { key: "flowsync", appCode: "FLOWSYNC", name: "FlowSync", description: "Workflow automation and process orchestration for growing teams.", nativeDomain: "workautomation.app", medhaDomain: "automate.medha.io" },
  { key: "digitalstudio", appCode: "DIGITALSTUDIO", name: "Digital Studio", description: "Creative and content production studio powered by AI.", nativeDomain: "digitalstudios.app", medhaDomain: "chitra.medha.io" },
  { key: "aevoice", appCode: "AEVOICE", name: "AEVOICE", description: "Voice AI agents for calls, support, and conversational automation.", nativeDomain: "aevoice.ai", medhaDomain: "televaani.medha.io" },
  { key: "healthai", appCode: "HEALTHAI", name: "HealthAI", description: "AI-assisted health and wellness management platform.", nativeDomain: "health.workautomation.app", medhaDomain: "med.medha.io" },
  { key: "vetconnect", appCode: "VETCONNECT", name: "VetConnect", description: "Practice management and client engagement for veterinary clinics.", nativeDomain: "vet.workautomation.app", medhaDomain: "vet.medha.io" },
  { key: "hellobiz", appCode: "HBIZ", name: "HelloBiz", description: "Marketing, outreach, and customer engagement for small businesses.", nativeDomain: "hellobiz.app", medhaDomain: "market.medha.io" },
  { key: "sreeos", appCode: "SREEOS", name: "Sree OS", description: "AI-native operating layer for coordinating agents and services.", nativeDomain: "os.aevoice.ai", medhaDomain: "code.medha.io" },
  { key: "payroll", appCode: "PAYROLL", name: "Payroll & Billing", description: "Payroll processing and billing automation across the ecosystem.", nativeDomain: "pay.hellobiz.app", medhaDomain: "pay.medha.io" },
];

export default function EcosystemLinks({ selfKey, onMedha, compact = false }) {
  const apps = ECOSYSTEM_APPS.filter((app) => app.key !== selfKey);
  const [live, setLive] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("zzEcosystem", {});
        if (!alive || !res || res.ok !== true || !res.ecosystem_plan) return;
        const launchUrls = {};
        for (const a of res.apps || []) launchUrls[a.app_code] = a.launch_url;
        setLive({
          planName: onMedha ? res.ecosystem_plan.medha_display_name : res.ecosystem_plan.aeva_display_name,
          launchUrls,
        });
      } catch {}
    })();
    return () => { alive = false; };
  }, [onMedha]);

  if (apps.length === 0) return null;

  const label = live ? `Included in your ${live.planName}` : "Explore the Medha.io Ecosystem";

  const grid = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 text-left">
      {apps.map((app) => {
        const liveUrl = live?.launchUrls?.[app.appCode];
        const domain = onMedha ? app.medhaDomain : app.nativeDomain;
        const href = liveUrl || `https://${domain}`;
        return (
          <a
            key={app.key}
            href={href}
            target={liveUrl ? "_self" : "_blank"}
            rel="noopener noreferrer"
            className="group rounded-lg border border-gray-700 px-3 py-2 transition-colors hover:border-gray-500 hover:bg-gray-800/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-200 group-hover:text-white">{app.name}</span>
              <span className="text-[10px] text-gray-500">{liveUrl ? "included ✓" : domain}</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-gray-400">{app.description}</p>
          </a>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-300"
        >
          <span>{label}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div className="mt-3">{grid}</div>}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      {grid}
    </div>
  );
}
