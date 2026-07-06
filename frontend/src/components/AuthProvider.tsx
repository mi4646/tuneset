import { type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearToken } from "@/api";
import { useMe } from "@/hooks/queries";
import { AuthCtx } from "@/hooks/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: user, isLoading: loading, refetch } = useMe();

  const refreshUser = async () => {
    await refetch();
  };

  const logout = () => {
    clearToken();
    qc.invalidateQueries({ queryKey: ["auth", "me"] });
    location.assign("/login");
  };

  return (
    <AuthCtx.Provider value={{ user: user ?? null, loading, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
