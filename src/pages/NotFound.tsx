import { useLocation, Link } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <span>SYS::ROUTE_ERR</span>
          <span className="text-[hsl(var(--terminal-amber,32_100%_58%))]">404</span>
        </div>
        <div className="space-y-4 px-6 py-8 font-mono">
          <h1 className="font-serif text-3xl text-foreground">Route not found</h1>
          <p className="text-sm text-muted-foreground">
            <span className="text-[hsl(var(--terminal-amber,32_100%_58%))]">&gt;</span> path{" "}
            <span className="text-foreground">{location.pathname}</span> is unregistered on this terminal.
          </p>
          <Link
            to="/"
            className="inline-block border border-border px-4 py-2 text-xs uppercase tracking-widest text-foreground transition-colors hover:bg-muted"
          >
            ← Return to base
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
