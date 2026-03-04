// Re-export from useSubscriptionTier to avoid duplicate API calls
import { useSubscriptionTier } from "./useSubscriptionTier";

export const useIsAdmin = () => {
  const { isAdmin, loading } = useSubscriptionTier();
  return { isAdmin, loading };
};
