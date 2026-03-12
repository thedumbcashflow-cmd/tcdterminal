import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find users whose trial has expired and are still on pro_trial / free with active trial
    const { data: expiredUsers, error: fetchError } = await supabase
      .from("profiles")
      .select("id")
      .not("trial_ends_at", "is", null)
      .lt("trial_ends_at", new Date().toISOString())
      .in("subscription_tier", ["free", "pro"]);

    if (fetchError) throw fetchError;

    let updated = 0;
    if (expiredUsers && expiredUsers.length > 0) {
      const ids = expiredUsers.map((u: any) => u.id);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ subscription_tier: "free", trial_ends_at: null })
        .in("id", ids);

      if (updateError) throw updateError;
      updated = ids.length;
    }

    return new Response(
      JSON.stringify({ ok: true, expired_count: updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
