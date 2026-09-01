import React from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
    staleTime: 60000,
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription_layout", user?.email],
    queryFn: () =>
      base44.entities.Subscription.filter({ owner_email: user?.email }, null, 1).then(r => r[0] || null),
    enabled: !!user?.email,
  });

  // Lane 1 (Business) ladder: creator/starter share the entry level since
  // nothing gates specifically between them; growth/agency keep their
  // existing thresholds. Lane 2 (Movie Maker Pro) tiers and BYOK all map to
  // 4 — the level Movie Maker/Song Creator/Media Editor already gate on —
  // since any Lane-2 subscription (even the cheapest) or BYOK is the whole
  // reason to reach those pages; there's no meaningful sub-ordering to model
  // between them here.
  const TIER_MAP = {
    creator: 1, starter: 1, growth: 2, agency: 3,
    indie: 4, studio: 4, dubbing_house: 4, enterprise: 4,
    byok: 4,
  };
  const userTier = TIER_MAP[subscription?.plan_tier] || 0;
  const isAdmin = String(user?.role || "").trim().toLowerCase() === "admin";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar userTier={userTier} isAdmin={isAdmin} user={user} subscription={subscription} />
      <main className="flex-1 overflow-y-auto lg:ml-64">
        <div className="p-4 md:p-6 min-h-full">
          <Outlet context={{ user, userTier, isAdmin, subscription }} />
        </div>
      </main>
    </div>
  );
}