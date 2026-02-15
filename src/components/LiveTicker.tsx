import { useState, useEffect } from "react";

interface TickerItem {
  symbol: string;
  price: number;
  change24h: number;
}

const MOCK_TICKERS: TickerItem[] = [
  { symbol: "SOL", price: 178.42, change24h: 3.21 },
  { symbol: "BTC", price: 97654.30, change24h: -0.85 },
  { symbol: "ETH", price: 3421.15, change24h: 1.47 },
  { symbol: "JUP", price: 1.23, change24h: 5.62 },
  { symbol: "JTO", price: 3.87, change24h: -2.14 },
  { symbol: "BONK", price: 0.00002341, change24h: 12.5 },
  { symbol: "RAY", price: 5.67, change24h: -0.32 },
  { symbol: "PYTH", price: 0.45, change24h: 7.89 },
];

const LiveTicker = () => {
  const [tickers] = useState<TickerItem[]>(MOCK_TICKERS);

  const formatPrice = (price: number) => {
    if (price < 0.01) return price.toFixed(8);
    if (price < 1) return price.toFixed(4);
    if (price > 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return price.toFixed(2);
  };

  return (
    <div className="w-full overflow-hidden border-t border-border bg-secondary/30">
      <div className="flex animate-ticker-scroll whitespace-nowrap">
        {[...tickers, ...tickers].map((t, i) => (
          <div key={i} className="inline-flex items-center gap-2 px-4 py-1">
            <span className="text-xs font-bold text-muted-foreground">{t.symbol}</span>
            <span className="font-data text-xs text-foreground">${formatPrice(t.price)}</span>
            <span
              className={`font-data text-xs ${
                t.change24h >= 0 ? "text-terminal-green" : "text-terminal-red"
              }`}
            >
              {t.change24h >= 0 ? "▲" : "▼"} {Math.abs(t.change24h).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveTicker;
