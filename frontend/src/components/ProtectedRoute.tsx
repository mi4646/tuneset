import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Spinner from "./Spinner";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="加载中…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
