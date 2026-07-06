import { useLocation, Link } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <main
      role="main"
      aria-labelledby="notfound-title"
      className="flex min-h-dvh items-center justify-center bg-background p-6"
    >
      <section className="w-full max-w-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <span>SYS::ROUTE_ERR</span>
          <span aria-hidden="true" className="text-[hsl(var(--terminal-amber,32_100%_58%))]">
            404
          </span>
        </header>
        <div className="space-y-4 px-6 py-8 font-mono">
          <h1 id="notfound-title" className="font-serif text-3xl text-foreground">
            <span className="sr-only">404 — </span>Route not found
          </h1>
          <p className="text-sm text-muted-foreground">
            <span aria-hidden="true" className="text-[hsl(var(--terminal-amber,32_100%_58%))]">
              &gt;
            </span>{" "}
            path{" "}
            <span className="text-foreground">{location.pathname}</span> is unregistered on this terminal.
          </p>
          <Link
            to="/"
            aria-label="Return to base — go to home page"
            className="inline-block border border-border px-4 py-2 text-xs uppercase tracking-widest text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            ← Return to base
          </Link>
        </div>
      </section>
    </main>
  );
};

export default NotFound;
