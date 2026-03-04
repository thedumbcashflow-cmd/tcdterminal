import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type SubscriptionTier = Database["public"]["Enums"]["subscription_tier"];

export const useSubscriptionTier = () => {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTier("free");
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      const [{ data: profileData }, { data: roleData }] = await Promise.all([
        supabase.from("profiles").select("subscription_tier").eq("id", user.id).single(),
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      ]);

      if (profileData) setTier(profileData.subscription_tier);
      setIsAdmin(!!roleData);
      setLoading(false);
    };

    fetch();
  }, [user]);

  // Admin bypasses all tier gating
  return {
    tier,
    loading,
    isAdmin,
    isPro: isAdmin || tier === "pro" || tier === "whale",
    isWhale: isAdmin || tier === "whale",
  };
};
