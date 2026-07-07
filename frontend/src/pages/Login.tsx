import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useLogin } from "@/hooks/queries";
import { errMsg } from "@/lib/error";
import { useAuth } from "@/hooks/useAuth";
import Spinner from "@/components/Spinner";
import AuthShell from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { user, loading, refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const login = useLogin();

  if (loading) return <Spinner label="加载中…" />;
  if (user) return <Navigate to="/songlist" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailErr("");
    setPasswordErr("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailErr("请输入有效邮箱");
      return;
    }
    if (password.length < 8) {
      setPasswordErr("密码至少 8 位");
      return;
    }
    setSubmitting(true);
    try {
      await login.mutateAsync({ email, password });
      await refreshUser();
    } catch (e: unknown) {
      toast.error(errMsg(e, "登录失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">登录</CardTitle>
          <CardDescription>输入邮箱密码登录账号</CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {emailErr && (
                <p role="alert" className="text-sm text-destructive mt-1">
                  {emailErr}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              {passwordErr && (
                <p role="alert" className="text-sm text-destructive mt-1">
                  {passwordErr}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "登录中…" : "登录"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              还没账号？
              <Link to="/register" className="text-primary hover:underline">
                注册
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  );
}
