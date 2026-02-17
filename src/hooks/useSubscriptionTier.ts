import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type SubscriptionTier = Database["public"]["Enums"]["subscription_tier"];

export const useSubscriptionTier = () => {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTier("free");
      setLoading(false);
      return;
    }

    const fetchTier = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setTier(data.subscription_tier);
      }
      setLoading(false);
    };

    fetchTier();
  }, [user]);

  return {
    tier,
    loading,
    isPro: tier === "pro" || tier === "whale",
    isWhale: tier === "whale",
  };
};
