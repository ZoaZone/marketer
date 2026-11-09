import React from "react";
import { BRAND } from "@/lib/brand";

/**
 * Shared page header for the creative tools — icon avatar + title + short
 * description + an optional primary action, all in one consistent row.
 * `iconGradient` accepts a Tailwind "from-x to-y" pair so each tool keeps
 * its own accent color.
 */
export default function PageHeader({ icon: Icon, iconGradient = "from-cyan-500 to-blue-600", title, subtitle, actions }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {Icon && (
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-lg shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase">{BRAND.name}</p>
        <h1 className="text-xl font-black text-foreground">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
