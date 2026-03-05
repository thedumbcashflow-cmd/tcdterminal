import React, { useState, useEffect, useRef } from "react";
import { Search, LogOut, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const SEARCHABLE_ITEMS = [
  { label: "SOL — Solana", route: "/", type: "Asset" },
  { label: "BTC — Bitcoin", route: "/", type: "Asset" },
  { label: "ETH — Ethereum", route: "/", type: "Asset" },
  { label: "JUP — Jupiter", route: "/", type: "Asset" },
  { label: "BONK — Bonk", route: "/", type: "Asset" },
  { label: "RAY — Raydium", route: "/", type: "Asset" },
  { label: "PYTH — Pyth Network", route: "/", type: "Asset" },
  { label: "HNT — Helium", route: "/depin-tracker", type: "DePIN" },
  { label: "RNDR — Render", route: "/depin-tracker", type: "DePIN" },
  { label: "FIL — Filecoin", route: "/depin-tracker", type: "DePIN" },
  { label: "Whale Flows", route: "/whale-flows", type: "Page" },
  { label: "Liquidations", route: "/liquidations", type: "Page" },
  { label: "Data Room", route: "/data-room", type: "Page" },
  { label: "Network Health", route: "/network-health", type: "Page" },
  { label: "DePIN Tracker", route: "/depin-tracker", type: "Page" },
  { label: "Pricing", route: "/pricing", type: "Page" },
];

const TopBar = React.forwardRef<HTMLElement>((_, forwardedRef) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  const results = searchQuery.length > 0
    ? SEARCHABLE_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (route: string) => {
    setSearchQuery("");
    setShowResults(false);
    navigate(route);
  };

  return (
    <header ref={forwardedRef} className="flex items-center justify-between border-b border-border bg-card px-4 py-1.5">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-sm font-bold tracking-wide text-primary">TCD</h1>
        <span className="text-xs text-muted-foreground hidden md:inline">TOKEN CATALYST DESK</span>
      </div>

      <div ref={searchContainerRef} className="relative">
        <div className="flex items-center gap-2 border border-border bg-background px-2 py-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            placeholder="Search assets, pages..."
            className="w-32 md:w-48 bg-transparent font-data text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setShowResults(false); }}>
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        {showResults && searchQuery.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border bg-card shadow-lg max-h-64 overflow-auto">
            {results.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                No results for "{searchQuery}"
              </div>
            ) : (
              results.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(item.route)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-secondary/50 transition-colors"
                >
                  <span className="text-foreground font-data">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.type}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="font-data text-muted-foreground hidden md:inline">
          {now.toLocaleTimeString("en-US", { hour12: false })} UTC
        </span>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-terminal-green animate-pulse" />
          <span className="text-muted-foreground">LIVE</span>
        </div>
        {user && (
          <div className="flex items-center gap-2 border-l border-border pl-3">
            <span className="font-data text-muted-foreground truncate max-w-[120px] hidden sm:inline">
              {user.user_metadata?.full_name || user.email?.split("@")[0]}
            </span>
            <button onClick={signOut} className="text-muted-foreground transition-colors hover:text-primary" title="Sign out">
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
});
TopBar.displayName = "TopBar";

export default TopBar;
