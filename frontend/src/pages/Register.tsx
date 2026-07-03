import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../api";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authApi.register({ email, password, invite_code: invite || undefined });
      nav("/login");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(msg || "注册失败");
    }
  };

  return (
    <form onSubmit={submit}>
      <h1>TuneSet 注册</h1>
      <input placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="密码（8-64）" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input placeholder="邀请码" value={invite} onChange={(e) => setInvite(e.target.value)} />
      <button type="submit">注册</button>
      {err && <p style={{ color: "red" }}>{err}</p>}
      <Link to="/login">已有账号？登录</Link>
    </form>
  );
}
