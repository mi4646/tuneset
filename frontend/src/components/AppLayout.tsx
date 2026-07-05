import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/songlist" className="brand">
          TuneSet
        </Link>
        {user && (
          <div className="user-menu">
            <span className="user-email">{user.email}</span>
            <button className="btn btn-ghost" onClick={logout}>
              登出
            </button>
          </div>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
