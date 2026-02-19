import { BarChart3, Waves, Flame, Database, Lock, Settings, Activity, Cpu, Menu, X, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

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

const TerminalSidebar = ({ activeItem = "dashboard" }: { activeItem?: string }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tier, setTier] = useState<string>("free");
  const [isOpen, setIsOpen] = useState(false);

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

  const isFree = tier === "free";

  const navItems = (
    <>
      <SidebarItem icon={<BarChart3 className="h-3.5 w-3.5" />} label="Dashboard" active={activeItem === "dashboard"} onClick={() => { navigate("/"); setIsOpen(false); }} />
      <SidebarItem icon={<Waves className="h-3.5 w-3.5" />} label="Whale Flows" active={activeItem === "whale-flows"} onClick={() => { navigate("/whale-flows"); setIsOpen(false); }} />
      <SidebarItem
        icon={<Flame className="h-3.5 w-3.5" />}
        label="Liquidations"
        active={activeItem === "liquidations"}
        locked={isFree}
        onClick={() => { navigate(isFree ? "/pricing?return=/liquidations" : "/liquidations"); setIsOpen(false); }}
      />
      <SidebarItem
        icon={<Database className="h-3.5 w-3.5" />}
        label="Data Room"
        active={activeItem === "data-room"}
        locked={isFree}
        onClick={() => { navigate(isFree ? "/pricing?return=/data-room" : "/data-room"); setIsOpen(false); }}
      />
      <SidebarItem icon={<Activity className="h-3.5 w-3.5" />} label="Network Health" active={activeItem === "network-health"} onClick={() => { navigate("/network-health"); setIsOpen(false); }} />
      <SidebarItem icon={<Cpu className="h-3.5 w-3.5" />} label="DePIN Tracker" active={activeItem === "depin-tracker"} onClick={() => { navigate("/depin-tracker"); setIsOpen(false); }} />
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-2 left-2 z-50 md:hidden border border-border bg-card p-1.5"
      >
        <Menu className="h-4 w-4 text-primary" />
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 md:hidden" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex h-full w-48 flex-col border-r border-border bg-sidebar flex-shrink-0",
          "max-md:fixed max-md:top-0 max-md:left-0 max-md:z-50 max-md:transition-transform max-md:duration-200",
          isOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
      >
        <div className="border-b border-border px-3 py-3 flex items-center justify-between">
          <div>
            <div className="font-serif text-lg font-bold text-primary">◆ TCD</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              Solana Intelligence
            </div>
            <div className="mt-1.5 inline-block border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
              {tier}
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-muted-foreground hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 py-2 space-y-0.5">
          {navItems}
        </nav>

        <div className="border-t border-border p-2 space-y-0.5">
          <SidebarItem icon={<CreditCard className="h-3.5 w-3.5" />} label="Pricing" active={activeItem === "pricing"} onClick={() => { navigate("/pricing"); setIsOpen(false); }} />
          <SidebarItem icon={<Settings className="h-3.5 w-3.5" />} label="Settings" />
        </div>
      </aside>
    </>
  );
};

export default TerminalSidebar;
