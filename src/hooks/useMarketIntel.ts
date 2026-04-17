import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type MarketIntel = Tables<"market_intel">;

export const useMarketIntel = () => {
  const [data, setData] = useState<MarketIntel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tier } = useSubscriptionTier();
  const { isAdmin } = useIsAdmin();

  const isPaid = isAdmin || tier === "pro" || tier === "whale";

  useEffect(() => {
    const fetchData = async () => {
      const { data: rows, error: fetchError } = await supabase
        .from("market_intel")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setData(rows || []);
      }
      setLoading(false);
    };

    fetchData();

    // Public (non-premium) realtime channel — only subscribes to is_premium=false rows.
    // RLS on market_intel still applies to postgres_changes payloads, but we add an
    // explicit filter to ensure premium rows are never broadcast on a non-premium topic.
    const publicChannel = supabase
      .channel("market_intel_public")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "market_intel",
          filter: "is_premium=eq.false",
        },
        (payload) => {
          setData((prev) => [payload.new as MarketIntel, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    // Premium channel — only subscribed when the user is paid/admin. Topic is
    // prefixed with "premium:" to satisfy realtime authorization policy.
    let premiumChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isPaid) {
      premiumChannel = supabase
        .channel("premium:market_intel")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "market_intel",
            filter: "is_premium=eq.true",
          },
          (payload) => {
            setData((prev) => [payload.new as MarketIntel, ...prev].slice(0, 50));
          }
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(publicChannel);
      if (premiumChannel) supabase.removeChannel(premiumChannel);
    };
  }, [isPaid]);

  return { data, loading, error };
};
