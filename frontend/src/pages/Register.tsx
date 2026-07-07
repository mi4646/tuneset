import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useRegister } from "@/hooks/queries";
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

export default function Register() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const register = useRegister();
  const nav = useNavigate();

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
    if (password.length < 8 || password.length > 64) {
      setPasswordErr("密码长度需 8-64");
      return;
    }
    setSubmitting(true);
    try {
      await register.mutateAsync({
        email,
        password,
        invite_code: invite || undefined,
      });
      nav("/login");
    } catch (e: unknown) {
      toast.error(errMsg(e, "注册失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">注册</CardTitle>
          <CardDescription>输入邮箱密码注册账号</CardDescription>
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
                placeholder="密码（8-64）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              {passwordErr && (
                <p role="alert" className="text-sm text-destructive mt-1">
                  {passwordErr}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite">邀请码（可选）</Label>
              <Input
                id="invite"
                placeholder="邀请码"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "注册中…" : "注册"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              已有账号？
              <Link to="/login" className="text-primary hover:underline">
                登录
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  );
}
