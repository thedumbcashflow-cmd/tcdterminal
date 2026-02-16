import { BarChart3, Waves, Flame, Database, Lock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  locked?: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ icon, label, active, locked, onClick }: SidebarItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors",
      active
        ? "bg-primary/10 text-primary border-l-2 border-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground border-l-2 border-transparent"
    )}
  >
    {icon}
    <span className="uppercase tracking-wider">{label}</span>
    {locked && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
  </button>
);

const TerminalSidebar = () => {
  const { user } = useAuth();
  const [tier, setTier] = useState<string>("free");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setTier(data.subscription_tier);
      });
  }, [user]);

  return (
    <aside className="flex h-full w-48 flex-col border-r border-border bg-sidebar">
      <div className="border-b border-border px-3 py-3">
        <div className="font-serif text-lg font-bold text-primary">◆ TCD</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          Solana Intelligence
        </div>
        <div className="mt-1.5 inline-block border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
          {tier}
        </div>
      </div>

      <nav className="flex-1 py-2 space-y-0.5">
        <SidebarItem icon={<BarChart3 className="h-3.5 w-3.5" />} label="Dashboard" active />
        <SidebarItem icon={<Waves className="h-3.5 w-3.5" />} label="Whale Flows" />
        <SidebarItem
          icon={<Flame className="h-3.5 w-3.5" />}
          label="Liquidations"
          locked={tier === "free"}
        />
        <SidebarItem
          icon={<Database className="h-3.5 w-3.5" />}
          label="Data Room"
          locked={tier === "free"}
        />
      </nav>

      <div className="border-t border-border p-2">
        <SidebarItem icon={<Settings className="h-3.5 w-3.5" />} label="Settings" />
      </div>
    </aside>
  );
};

export default TerminalSidebar;
