import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="font-serif text-lg font-bold text-primary">◆ TCD</div>
          <div className="mt-2 font-data text-xs text-muted-foreground animate-pulse">
            INITIALIZING TERMINAL...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
