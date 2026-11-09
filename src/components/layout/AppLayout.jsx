import React from "react";
import { Outlet, useOutletContext } from "react-router-dom";
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

  const TIER_MAP = { starter: 1, growth: 2, agency: 3 };
  const userTier = TIER_MAP[subscription?.plan_tier] || 0;
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar userTier={userTier} isAdmin={isAdmin} user={user} />
      <main className="flex-1 overflow-y-auto lg:ml-64">
        <div className="p-4 md:p-6 min-h-full">
          <Outlet context={{ user, userTier, isAdmin, subscription }} />
        </div>
      </main>
    </div>
  );
}