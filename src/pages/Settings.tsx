import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import TerminalSidebar from "@/components/TerminalSidebar";
import TopBar from "@/components/TopBar";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Tokyo", "Asia/Shanghai",
  "Asia/Kolkata", "Asia/Dubai", "Africa/Johannesburg", "Australia/Sydney",
];

const Settings = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", user.id)
        .single();
      if (data) {
        setUsername(data.username || "");
      }
      // Load timezone from localStorage (simple persistence)
      const savedTz = localStorage.getItem("tcd_timezone");
      if (savedTz) setTimezone(savedTz);
      setLoading(false);
    };
    load();
  }, [user, authLoading, navigate]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ username: username.trim() || null })
      .eq("id", user.id);
    localStorage.setItem("tcd_timezone", timezone);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <TerminalSidebar activeItem="settings" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-lg">
            <h1 className="font-serif text-xl font-bold text-primary mb-1">◆ Settings</h1>
            <p className="text-xs text-muted-foreground mb-6">Configure your terminal preferences</p>

            {saved && (
              <div className="mb-4 border border-terminal-green bg-terminal-green/10 px-3 py-1.5 text-xs font-bold text-terminal-green">
                ✓ Settings saved successfully
              </div>
            )}

            <div className="space-y-4">
              {/* Username */}
              <div className="border border-border bg-card p-4">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Display Name</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-data text-foreground"
                  placeholder="Your display name"
                />
              </div>

              {/* Timezone */}
              <div className="border border-border bg-card p-4">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-data text-foreground"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              {/* Email (read-only) */}
              <div className="border border-border bg-card p-4">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</label>
                <div className="mt-1 w-full border border-border bg-background/50 px-2 py-1.5 text-xs font-data text-muted-foreground">
                  {user?.email}
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 border border-primary bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
