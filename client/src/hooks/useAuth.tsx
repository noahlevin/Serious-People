import { createContext, useContext, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { identifyUser, resetUser } from "@/lib/posthog";

interface User {
  id: string;
  email: string | null;
  name: string | null;
  providedName: string | null;
}

interface JourneyState {
  interviewComplete: boolean;
  paymentVerified: boolean;
  module1Complete: boolean;
  module2Complete: boolean;
  module3Complete: boolean;
  hasSeriousPlan: boolean;
}

interface JourneyData {
  state: JourneyState;
  phase: string;
}

interface RoutingData {
  canonicalPath: string;
  resumePath: string;
  allowedPaths: string[];
}

interface BootstrapResponse {
  authenticated: boolean;
  user: User | null;
  journey: JourneyData | null;
  routing: RoutingData | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authChecked: boolean;
  journey: JourneyData | null;
  routing: RoutingData | null;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  const { data, isLoading, refetch, isFetched } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  
  // Identify user in PostHog when authenticated
  if (data?.authenticated && data?.user?.email) {
    identifyUser(data.user.email, { name: data.user.name });
  }
  
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/auth/logout");
    },
    onSuccess: () => {
      resetUser();
      queryClient.setQueryData(["/api/bootstrap"], { 
        authenticated: false, 
        user: null, 
        journey: null, 
        routing: null 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
    },
  });
  
  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);
  
  const value: AuthContextType = {
    user: data?.user || null,
    isAuthenticated: data?.authenticated || false,
    isLoading,
    authChecked: isFetched,
    journey: data?.journey || null,
    routing: data?.routing || null,
    logout,
    refetch,
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
