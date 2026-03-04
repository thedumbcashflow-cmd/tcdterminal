import { X, Lock, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface AssetDetail {
  id: string;
  asset_symbol: string;
  flow_type: string | null;
  value_usd: number | null;
  wallet_label: string | null;
  liquidation_level: number | null;
  whale_flow_score: number | null;
  intel_type: string | null;
  is_premium: boolean;
  created_at: string;
}

interface AssetDetailModalProps {
  asset: AssetDetail | null;
  onClose: () => void;
  isPaid: boolean;
  onUpgrade: () => void;
}

const formatValue = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const AssetDetailModal = ({ asset, onClose, isPaid, onUpgrade }: AssetDetailModalProps) => {
  if (!asset) return null;

  const isLocked = asset.is_premium && !isPaid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg mx-4 border border-border bg-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-serif text-sm font-bold text-primary">◆</span>
            <span className="font-serif text-sm font-bold text-foreground">{asset.asset_symbol}</span>
            {asset.intel_type && (
              <span className="border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                {asset.intel_type.replace("_", " ")}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLocked ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <Lock className="h-8 w-8 text-muted-foreground mb-3" />
            <h3 className="font-serif text-base font-bold text-foreground">Premium Intel</h3>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              This asset detail requires a PRO or WHALE subscription.
            </p>
            <button
              onClick={onUpgrade}
              className="mt-4 border border-primary bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
            >
              Upgrade Plan
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/* Flow Direction */}
            {asset.flow_type && (
              <div className="flex items-center gap-2">
                {asset.flow_type === "buy" ? (
                  <TrendingUp className="h-4 w-4 text-terminal-green" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-terminal-red" />
                )}
                <span className={`text-sm font-bold uppercase ${asset.flow_type === "buy" ? "text-terminal-green" : "text-terminal-red"}`}>
                  {asset.flow_type}
                </span>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-2">
              {asset.value_usd != null && (
                <div className="border border-border p-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Value</span>
                  <div className="font-data text-lg font-bold text-foreground mt-1">{formatValue(asset.value_usd)}</div>
                </div>
              )}
              {asset.whale_flow_score != null && (
                <div className="border border-border p-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Flow Score</span>
                  <div className="font-data text-lg font-bold text-primary mt-1">{asset.whale_flow_score}</div>
                </div>
              )}
              {asset.liquidation_level != null && (
                <div className="border border-border p-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Liq Level</span>
                  <div className="font-data text-lg font-bold text-terminal-red mt-1">${asset.liquidation_level}</div>
                </div>
              )}
              {asset.wallet_label && (
                <div className="border border-border p-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Wallet</span>
                  <div className="text-sm font-bold text-foreground mt-1">{asset.wallet_label}</div>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="border-t border-border pt-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Timestamp</span>
                <span className="font-data text-foreground">{format(new Date(asset.created_at), "yyyy-MM-dd HH:mm:ss")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Intel Type</span>
                <span className="font-data text-foreground uppercase">{asset.intel_type || "—"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Premium</span>
                <span className={`font-data ${asset.is_premium ? "text-primary" : "text-muted-foreground"}`}>{asset.is_premium ? "YES" : "NO"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Record ID</span>
                <span className="font-data text-muted-foreground">{asset.id.slice(0, 12)}...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetDetailModal;
