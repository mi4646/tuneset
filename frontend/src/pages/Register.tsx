import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { authApi } from "../api";
import { useAuth } from "../hooks/useAuth";
import Spinner from "../components/Spinner";

export default function Register() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  if (loading) return <Spinner label="加载中…" />;
  if (user) return <Navigate to="/songlist" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr("请输入有效邮箱");
      return;
    }
    if (password.length < 8 || password.length > 64) {
      setErr("密码长度需 8-64");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.register({
        email,
        password,
        invite_code: invite || undefined,
      });
      nav("/login");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail;
      setErr(msg || "注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card">
        <h1>TuneSet 注册</h1>
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
            placeholder="密码（8-64）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            className="input"
            placeholder="邀请码（可选）"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
          {err && <div className="error-banner">{err}</div>}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "注册中…" : "注册"}
          </button>
        </form>
        <p className="form-foot">
          已有账号？<Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}
