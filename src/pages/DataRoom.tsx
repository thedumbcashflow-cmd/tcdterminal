import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { Lock } from "lucide-react";

const DataRoom = () => {
  const navigate = useNavigate();
  const { isPro, loading } = useSubscriptionTier();

  if (!loading && !isPro) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <TerminalSidebar activeItem="data-room" />
          <main className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Lock className="h-8 w-8 text-primary mx-auto mb-3" />
              <h2 className="font-serif text-lg font-bold text-primary">Terminal Access Restricted</h2>
              <p className="mt-2 text-sm text-muted-foreground">Data Room requires a PRO or WHALE plan.</p>
              <button
                onClick={() => navigate("/pricing?return=/data-room")}
                className="mt-4 border border-primary bg-primary/10 px-6 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
              >
                View Plans
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="data-room" />
        <main className="flex flex-1 flex-col overflow-auto p-3">
          <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider mb-3">Data Room</h1>
          <div className="border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Premium institutional data feeds coming soon.</p>
            <p className="text-xs text-muted-foreground mt-2">On-chain analytics, DEX volumes, and protocol revenue dashboards.</p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default DataRoom;
