import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type MarketIntel = Tables<"market_intel">;

export const useMarketIntel = () => {
  const [data, setData] = useState<MarketIntel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const channel = supabase
      .channel("market_intel_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_intel" },
        (payload) => {
          setData((prev) => [payload.new as MarketIntel, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { data, loading, error };
};
