import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

const Auth = () => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "ACCOUNT CREATED",
          description: "Check your email to verify your account.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast({
        title: "AUTH ERROR",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm border border-border bg-card">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="font-serif text-xl font-bold text-primary">◆ TCD</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Token Catalyst Desk — Terminal Access
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              mode === "signin"
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              mode === "signup"
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 px-6 py-5">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-3 py-2 font-data text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              placeholder="operator@example.com"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-3 py-2 font-data text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              placeholder="••••••••"
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full border border-primary bg-primary/10 py-2 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {submitting ? "PROCESSING..." : mode === "signin" ? "AUTHENTICATE" : "REGISTER"}
          </button>
        </form>


        {/* Footer */}
        <div className="border-t border-border px-6 py-3 text-center">
          <span className="font-data text-[10px] text-muted-foreground">
            SECURE CONNECTION ◆ AES-256 ENCRYPTED
          </span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
