import { Search } from "lucide-react";
import { useState } from "react";

const TopBar = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const now = new Date();

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-1.5">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-sm font-bold tracking-wide text-primary">
          TCD
        </h1>
        <span className="text-xs text-muted-foreground">TOKEN CATALYST DESK</span>
      </div>

      <div className="flex items-center gap-2 border border-border bg-background px-2 py-1">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search assets, metrics..."
          className="w-48 bg-transparent font-data text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="font-data text-muted-foreground">
          {now.toLocaleTimeString("en-US", { hour12: false })} UTC
        </span>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-terminal-green animate-pulse" />
          <span className="text-muted-foreground">LIVE</span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
