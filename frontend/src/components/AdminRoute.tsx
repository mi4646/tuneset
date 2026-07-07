import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Spinner from "./Spinner";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="加载中…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_superuser) return <Navigate to="/songlist" replace />;
  return <>{children}</>;
}
