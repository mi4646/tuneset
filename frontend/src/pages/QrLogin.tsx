import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { qqApi, setCredential } from "../api";
import { useAuth } from "../hooks/useAuth";
import Spinner from "../components/Spinner";

type QrStatus = "loading" | "waiting" | "scanned" | "success" | "expired" | "error";

const STATUS_TEXT: Record<QrStatus, string> = {
  loading: "正在获取二维码…",
  waiting: "请用 QQ 音乐扫码",
  scanned: "已扫码，请在手机确认",
  success: "登录成功，跳转中…",
  expired: "二维码已过期",
  error: "获取二维码失败",
};

export default function QrLogin() {
  const { user, loading } = useAuth();
  const [img, setImg] = useState("");
  const [status, setStatus] = useState<QrStatus>("loading");
  const [qrKey, setQrKey] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval>;
    (async () => {
      setImg("");
      setStatus("loading");
      try {
        const r = await qqApi.qrcode();
        if (stopped) return;
        setImg(r.data.image_base64);
        setStatus("waiting");
        timer = setInterval(async () => {
          if (stopped) return;
          try {
            const c = await qqApi.check(r.data.identifier);
            if (c.data.done && c.data.credential) {
              setCredential(c.data.credential);
              if (timer) clearInterval(timer);
              setStatus("success");
              setTimeout(() => {
                if (!stopped) nav("/songlist");
              }, 800);
            } else {
              const ev = c.data.event as string;
              if (ev === "expired") {
                if (timer) clearInterval(timer);
                setStatus("expired");
              } else if (ev === "scanned") {
                setStatus("scanned");
              }
            }
          } catch {
            // 单次轮询失败忽略，下轮重试
          }
        }, 2000);
      } catch {
        if (!stopped) setStatus("error");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [qrKey, nav, user]);

  if (loading) return <Spinner label="加载中…" />;

  if (!user) {
    return (
      <div className="auth-page">
        <div className="card qr-card">
          <h1>QQ 音乐扫码登录</h1>
          <p className="hint">请先账号登录后再扫码绑定 QQ 音乐。</p>
          <Link to="/login" className="btn">
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const showImg =
    img && status !== "expired" && status !== "error" && status !== "loading";

  return (
    <div className="auth-page">
      <div className="card qr-card">
        <h1>QQ 音乐扫码登录</h1>
        <div className="qr-wrap">
          {showImg ? (
            <img
              src={`data:image/png;base64,${img}`}
              alt="QQ 音乐二维码"
              width={200}
              height={200}
            />
          ) : (
            <div className="qr-placeholder">
              {status === "expired"
                ? "已过期"
                : status === "error"
                  ? "获取失败"
                  : "加载中…"}
            </div>
          )}
        </div>
        <p className="qr-status">{STATUS_TEXT[status]}</p>
        {(status === "expired" || status === "error") && (
          <button className="btn" onClick={() => setQrKey((k) => k + 1)}>
            重新获取
          </button>
        )}
      </div>
    </div>
  );
}
