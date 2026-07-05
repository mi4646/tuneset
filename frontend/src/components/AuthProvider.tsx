import { useEffect, useState, type ReactNode } from "react";
import { authApi, clearToken, isLoggedIn } from "../api";
import { AuthCtx, type User } from "../hooks/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((r) => setUser(r.data as User))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    clearToken();
    setUser(null);
    location.assign("/login");
  };

  return <AuthCtx.Provider value={{ user, loading, logout }}>{children}</AuthCtx.Provider>;
}
