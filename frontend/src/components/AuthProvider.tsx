import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authApi, clearToken, isLoggedIn } from "../api";
import { AuthCtx, type User } from "../hooks/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!isLoggedIn()) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await authApi.me();
      setUser(r.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = () => {
    clearToken();
    setUser(null);
    location.assign("/login");
  };

  return (
    <AuthCtx.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
