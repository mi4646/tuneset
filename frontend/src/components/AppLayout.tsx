import { Link, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-svh flex flex-col">
      <header className="flex items-center justify-between px-8 py-4 border-b bg-background">
        <Link
          to="/songlist"
          className="text-lg font-bold text-foreground hover:no-underline"
        >
          TuneSet
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              登出
            </Button>
          </div>
        )}
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
