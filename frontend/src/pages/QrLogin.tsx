import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { qqApi } from "../api";
import { useAuth } from "../hooks/useAuth";
import Spinner from "../components/Spinner";
import { config } from "../config";

type QrStatus = "loading" | "waiting" | "scanned" | "success" | "expired" | "error" | "network_error" | "device_limit";

const STATUS_TEXT: Record<QrStatus, string> = {
  loading: "正在获取二维码…",
  waiting: "请用 QQ 音乐扫码",
  scanned: "已扫码，请在手机确认",
  success: "登录成功，跳转中…",
  expired: "二维码已过期",
  error: "获取二维码失败",
  network_error: "网络异常，请重新扫码",
  device_limit: "登录设备超限，请在 QQ 音乐 APP 退出其他设备后重新扫码",
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
            if (c.data.done && c.data.bound) {
              if (timer) clearInterval(timer);
              setStatus("success");
              setTimeout(() => {
                if (!stopped) nav("/songlist");
              }, 800);
            } else {
              const ev = c.data.event as string;
              if (ev === "expired") {
                if (timer) clearInterval(timer);
                setQrKey((k) => k + 1); // 过期自动刷新
              } else if (ev === "scanned") {
                setStatus("scanned");
              } else if (ev === "NETWORK_ERROR") {
                if (timer) clearInterval(timer);
                setStatus("network_error");
              } else if (ev === "DEVICE_LIMIT") {
                if (timer) clearInterval(timer);
                setStatus("device_limit");
              }
            }
          } catch {
            // 单次轮询失败忽略，下轮重试
          }
        }, config.qrPollInterval);
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
    img && status !== "expired" && status !== "error" && status !== "loading" && status !== "network_error" && status !== "device_limit";

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
                  : status === "network_error"
                    ? "网络异常"
                    : status === "device_limit"
                      ? "设备超限"
                      : "加载中…"}
            </div>
          )}
        </div>
        <p className="qr-status">{STATUS_TEXT[status]}</p>
        {(status === "error" || status === "network_error" || status === "device_limit") && (
          <button className="btn" onClick={() => setQrKey((k) => k + 1)}>
            重新获取
          </button>
        )}
      </div>
    </div>
  );
}
