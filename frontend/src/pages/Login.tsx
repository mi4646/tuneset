import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { authApi } from "../api";
import { useAuth } from "../hooks/useAuth";
import Spinner from "../components/Spinner";

export default function Login() {
  const { user, loading, refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Spinner label="加载中…" />;
  if (user) return <Navigate to="/songlist" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr("请输入有效邮箱");
      return;
    }
    if (password.length < 8) {
      setErr("密码至少 8 位");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.login({ email, password });
      await refreshUser();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail;
      setErr(msg || "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card">
        <h1>TuneSet 登录</h1>
        <form onSubmit={submit} className="form">
          <input
            className="input"
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="input"
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {err && <div className="error-banner">{err}</div>}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>
        <p className="form-foot">
          还没账号？<Link to="/register">注册</Link>
        </p>
      </div>
    </div>
  );
}
