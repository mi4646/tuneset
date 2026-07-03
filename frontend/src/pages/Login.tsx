import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authApi.login({ email, password });
      nav("/songlist");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(msg || "登录失败");
    }
  };

  return (
    <form onSubmit={submit}>
      <h1>TuneSet 登录</h1>
      <input placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">登录</button>
      {err && <p style={{ color: "red" }}>{err}</p>}
      <Link to="/register">注册</Link>
    </form>
  );
}
