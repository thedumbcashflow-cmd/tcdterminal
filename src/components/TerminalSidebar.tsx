import { useState } from "react";
import { BarChart3, Waves, Flame, Database, Lock, Settings, Activity, Cpu, Menu, X, CreditCard, Shield, LogOut, Globe, Coins, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
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
  const { signOut } = useAuth();
  const { tier, isAdmin } = useSubscriptionTier();
  const [isOpen, setIsOpen] = useState(false);

  const isLocked = (requiresPaid: boolean) => requiresPaid && tier === "free" && !isAdmin;
  const navTo = (path: string) => { navigate(path); setIsOpen(false); };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-2 left-2 z-50 md:hidden border border-border bg-card p-1.5"
      >
        <Menu className="h-4 w-4 text-primary" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 md:hidden" onClick={() => setIsOpen(false)} />
      )}

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
              {isAdmin ? "ADMIN" : tier}
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-muted-foreground hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 py-2 space-y-0.5">
          <SidebarItem icon={<BarChart3 className="h-3.5 w-3.5" />} label="Dashboard" active={activeItem === "dashboard"} onClick={() => navTo("/dashboard")} />
          <SidebarItem icon={<Waves className="h-3.5 w-3.5" />} label="Whale Flows" active={activeItem === "whale-flows"} onClick={() => navTo("/whale-flows")} />
          <SidebarItem
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Liquidations"
            active={activeItem === "liquidations"}
            locked={isLocked(true)}
            onClick={() => navTo(isLocked(true) ? "/pricing?return=/liquidations" : "/liquidations")}
          />
          <SidebarItem
            icon={<Database className="h-3.5 w-3.5" />}
            label="Data Room"
            active={activeItem === "data-room"}
            locked={isLocked(true)}
            onClick={() => navTo(isLocked(true) ? "/pricing?return=/data-room" : "/data-room")}
          />
          <SidebarItem icon={<Activity className="h-3.5 w-3.5" />} label="Network Health" active={activeItem === "network-health"} onClick={() => navTo("/network-health")} />
          <SidebarItem icon={<Cpu className="h-3.5 w-3.5" />} label="DePIN Tracker" active={activeItem === "depin-tracker"} onClick={() => navTo("/depin-tracker")} />
          <SidebarItem icon={<Coins className="h-3.5 w-3.5" />} label="Token Catalyst" active={activeItem === "token-catalyst"} onClick={() => navTo("/token-catalyst")} />
          <SidebarItem icon={<BarChart2 className="h-3.5 w-3.5" />} label="Financial Models" active={activeItem === "financial-models"} onClick={() => navTo("/financial-models")} />
          <SidebarItem
            icon={<Globe className="h-3.5 w-3.5" />}
            label="World Monitor"
            active={activeItem === "world-monitor"}
            locked={isLocked(true)}
            onClick={() => navTo(isLocked(true) ? "/pricing?return=/world-monitor" : "/world-monitor")}
          />
        </nav>

        <div className="border-t border-border p-2 space-y-0.5">
          <SidebarItem icon={<CreditCard className="h-3.5 w-3.5" />} label="Pricing" active={activeItem === "pricing"} onClick={() => navTo("/pricing")} />
          <SidebarItem icon={<Settings className="h-3.5 w-3.5" />} label="Settings" active={activeItem === "settings"} onClick={() => navTo("/settings")} />
          {isAdmin && (
            <SidebarItem icon={<Shield className="h-3.5 w-3.5" />} label="Admin" active={activeItem === "admin"} onClick={() => navTo("/admin")} />
          )}
          <SidebarItem icon={<LogOut className="h-3.5 w-3.5" />} label="Sign Out" onClick={() => { signOut(); setIsOpen(false); }} />
        </div>
      </aside>
    </>
  );
};

export default TerminalSidebar;
