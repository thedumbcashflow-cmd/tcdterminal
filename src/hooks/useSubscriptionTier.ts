import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type SubscriptionTier = Database["public"]["Enums"]["subscription_tier"];

interface SubscriptionState {
  tier: SubscriptionTier;
  isAdmin: boolean;
  loading: boolean;
  isPro: boolean;
  isWhale: boolean;
  displayName: string | null;
  timezone: string;
}

// Shared cache to prevent duplicate calls across components
let cachedResult: { userId: string; tier: SubscriptionTier; isAdmin: boolean; displayName: string | null; timezone: string } | null = null;
let cachePromise: Promise<void> | null = null;

export const useSubscriptionTier = (): SubscriptionState => {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>(cachedResult?.userId === user?.id ? cachedResult.tier : "free");
  const [isAdmin, setIsAdmin] = useState(cachedResult?.userId === user?.id ? cachedResult.isAdmin : false);
  const [displayName, setDisplayName] = useState<string | null>(cachedResult?.userId === user?.id ? cachedResult.displayName : null);
  const [timezone, setTimezone] = useState(cachedResult?.userId === user?.id ? cachedResult.timezone : "UTC");
  const [loading, setLoading] = useState(cachedResult?.userId !== user?.id);

  useEffect(() => {
    if (!user) {
      setTier("free");
      setIsAdmin(false);
      setDisplayName(null);
      setTimezone("UTC");
      setLoading(false);
      cachedResult = null;
      return;
    }

    // Use cache if available for same user
    if (cachedResult && cachedResult.userId === user.id) {
      setTier(cachedResult.tier);
      setIsAdmin(cachedResult.isAdmin);
      setDisplayName(cachedResult.displayName);
      setTimezone(cachedResult.timezone);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      // Deduplicate in-flight requests
      if (cachePromise) {
        await cachePromise;
        if (cachedResult && cachedResult.userId === user.id) {
          setTier(cachedResult.tier);
          setIsAdmin(cachedResult.isAdmin);
          setDisplayName(cachedResult.displayName);
          setTimezone(cachedResult.timezone);
          setLoading(false);
          return;
        }
      }

      let resolve: () => void;
      cachePromise = new Promise<void>((r) => { resolve = r; });

      const [{ data: profileData }, { data: roleData }] = await Promise.all([
        supabase.from("profiles").select("subscription_tier, display_name, timezone, username").eq("id", user.id).single(),
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      ]);

      const t = profileData?.subscription_tier || "free";
      const admin = !!roleData;
      const dn = profileData?.display_name || profileData?.username || null;
      const tz = profileData?.timezone || "UTC";

      cachedResult = { userId: user.id, tier: t, isAdmin: admin, displayName: dn, timezone: tz };
      setTier(t);
      setIsAdmin(admin);
      setDisplayName(dn);
      setTimezone(tz);
      setLoading(false);
      resolve!();
      cachePromise = null;
    };

    fetchData();
  }, [user]);

  return useMemo(() => ({
    tier,
    loading,
    isAdmin,
    displayName,
    timezone,
    isPro: isAdmin || tier === "pro" || tier === "whale",
    isWhale: isAdmin || tier === "whale",
  }), [tier, loading, isAdmin, displayName, timezone]);
};

// Export cache invalidator for settings changes
export const invalidateSubscriptionCache = () => {
  cachedResult = null;
  cachePromise = null;
};
