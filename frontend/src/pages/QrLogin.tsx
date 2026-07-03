import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { qqApi, setCredential } from "../api";

export default function QrLogin() {
  const [img, setImg] = useState("");
  const [msg, setMsg] = useState("加载中...");
  const nav = useNavigate();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval>;
    (async () => {
      try {
        const r = await qqApi.qrcode();
        setImg(r.data.image_base64);
        setMsg("请用 QQ 音乐扫码");
        timer = setInterval(async () => {
          if (stopped) return;
          try {
            const c = await qqApi.check(r.data.identifier);
            if (c.data.done && c.data.credential) {
              setCredential(c.data.credential);
              clearInterval(timer);
              setMsg("登录成功，跳转...");
              setTimeout(() => nav("/songlist"), 800);
            } else {
              setMsg(c.data.event || "等待扫码...");
            }
          } catch {
            // QR 过期等，忽略
          }
        }, 2000);
      } catch {
        setMsg("获取二维码失败");
      }
    })();
    return () => { stopped = true; if (timer) clearInterval(timer); };
  }, [nav]);

  return (
    <div>
      <h1>QQ 音乐扫码登录</h1>
      {img && <img src={`data:image/png;base64,${img}`} alt="QR" width={200} />}
      <p>{msg}</p>
    </div>
  );
}
