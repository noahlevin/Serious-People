import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { identifyUser, resetUser } from "@/lib/posthog";

interface User {
  id: string;
  email: string | null;
  name: string | null;
  providedName: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  const { data, isLoading, refetch } = useQuery<{ authenticated: boolean; user: User | null }>({
    queryKey: ["/auth/me"],
    staleTime: 0, // Always refetch to ensure fresh data
    retry: false,
  });
  
  useEffect(() => {
    if (data?.authenticated && data?.user?.email) {
      identifyUser(data.user.email, { name: data.user.name });
    }
  }, [data?.authenticated, data?.user?.email, data?.user?.name]);
  
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/auth/logout");
    },
    onSuccess: () => {
      resetUser();
      queryClient.setQueryData(["/auth/me"], { authenticated: false, user: null });
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
    },
  });
  
  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);
  
  const value: AuthContextType = {
    user: data?.user || null,
    isAuthenticated: data?.authenticated || false,
    isLoading,
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
