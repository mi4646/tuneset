import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { songlistApi, classifyApi, getCredential } from "../api";
import type { SongItem } from "../types";
import Spinner from "../components/Spinner";

const parseSongItems = (songs: Record<string, unknown>[]): SongItem[] =>
  songs.map((s) => ({
    song_id: (s.song_id as number) || (s.id as number),
    song_type: (s.song_type as number) || (s.type as number) || 0,
    name: (s.name as string) || (s.song_name as string) || "",
    singer: Array.isArray(s.singer)
      ? (s.singer as { name?: string }[]).map((x) => x.name).filter(Boolean).join(" / ")
      : (s.singer as string) || "",
    labels: (s.labels as string[]) || [],
  }));

export default function SonglistInput() {
  const [link, setLink] = useState("");
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pushInterval, setPushInterval] = useState(300);
  const [streaming, setStreaming] = useState(false);
  const nav = useNavigate();
  const hasQq = !!getCredential();
  const evtRef = useRef<EventSource | null>(null);

  const parseSonglistId = (s: string): number | null => {
    const m = s.match(/id=(\d+)/) || s.match(/(\d+)/);
    return m ? Number(m[1]) : null;
  };

  // 订阅"我喜欢"实时推送：subscribe 拿 stream_id + 首批数据，EventSource 接收后续更新
  const subscribeFav = async () => {
    setLoading(true);
    setErr("");
    try {
      const cred = getCredential();
      if (!cred) throw new Error("未登录 QQ 音乐");
      // 关闭旧连接
      if (evtRef.current) {
        evtRef.current.close();
        evtRef.current = null;
      }
      setStreaming(false);
      const r = await songlistApi.subscribeFavorite(cred);
      setSongs(parseSongItems(r.data?.songs || []));
      setLoaded(true);
      setPushInterval(r.data?.interval || 300);
      // 启动 EventSource 订阅实时更新
      const es = new EventSource(songlistApi.streamUrl(r.data.stream_id));
      es.onopen = () => setStreaming(true);
      es.addEventListener("fav_update", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            setErr(`推送失败：${data.error}`);
            return;
          }
          if (data.songs) {
            // 保留旧列表直到新数据返回（直接覆盖，React 异步渲染不会闪烁）
            setSongs(parseSongItems(data.songs));
          }
        } catch {
          // ignore parse error
        }
      });
      es.onerror = () => {
        es.close();
        evtRef.current = null;
        setStreaming(false);
        setErr("实时推送已断开，点刷新重试");
      };
      evtRef.current = es;
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        (e as { message?: string }).message ||
        "加载失败";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  // 自动加载：hasQq 时进入页面即订阅
  useEffect(() => {
    if (!hasQq) return;
    subscribeFav();
    return () => {
      if (evtRef.current) {
        evtRef.current.close();
        evtRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasQq]);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const id = parseSonglistId(link);
      if (!id) throw new Error("无法解析歌单 ID");
      const r = await songlistApi.shared(id);
      setSongs(parseSongItems(r.data?.songs || []));
      setLoaded(true);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        (e as { message?: string }).message ||
        "加载失败";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  const start = async () => {
    setLoading(true);
    setErr("");
    try {
      sessionStorage.setItem("classify_songs", JSON.stringify(songs));
      const r = await classifyApi.start(songs);
      nav(`/classify/${r.data.thread_id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail;
      setErr(msg || "启动分类失败");
    } finally {
      setLoading(false);
    }
  };

  const intervalText =
    pushInterval >= 60
      ? `每 ${Math.round(pushInterval / 60)} 分钟自动刷新`
      : `每 ${pushInterval} 秒自动刷新`;

  return (
    <div className="page">
      <h1>选择歌单</h1>

      <div className="entry-tabs">
        <div className="entry">
          <h2>粘贴分享链接</h2>
          <div className="row">
            <input
              className="input"
              placeholder="粘贴 QQ 音乐歌单分享链接"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button className="btn" onClick={load} disabled={loading || !link}>
              加载
            </button>
          </div>
        </div>
        <div className="entry">
          <h2>扫码取"我喜欢"</h2>
          {hasQq ? (
            <button className="btn" onClick={subscribeFav} disabled={loading}>
              加载我的喜欢
            </button>
          ) : (
            <Link to="/qr" className="btn btn-ghost">
              去扫码登录
            </Link>
          )}
        </div>
      </div>

      {loading && songs.length === 0 && <Spinner label="加载中…" />}
      {err && <div className="error-banner">{err}</div>}

      {loaded && songs.length === 0 && !loading && (
        <p className="empty">该歌单没有歌曲</p>
      )}

      {songs.length > 0 && (
        <div className="songlist">
          <div className="songlist-head">
            <span>
              已加载 {songs.length} 首
              {streaming && hasQq && (
                <span className="stream-hint"> · {intervalText}</span>
              )}
            </span>
            <div className="songlist-actions">
              {hasQq && (
                <button
                  className="btn btn-ghost"
                  onClick={subscribeFav}
                  disabled={loading}
                >
                  刷新
                </button>
              )}
              <button className="btn" onClick={start} disabled={loading}>
                开始分类
              </button>
            </div>
          </div>
          <div className="songlist-body">
            {songs.map((s, i) => (
              <div key={i} className="song-row">
                <span className="song-idx">{i + 1}</span>
                <span className="song-name">{s.name}</span>
                <span className="song-singer">{s.singer}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
