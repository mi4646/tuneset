import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { songlistApi, classifyApi, getCredential } from "../api";
import type { SongItem } from "../types";
import Spinner from "../components/Spinner";

export default function SonglistInput() {
  const [link, setLink] = useState("");
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const nav = useNavigate();
  const hasQq = !!getCredential();

  const parseSonglistId = (s: string): number | null => {
    const m = s.match(/id=(\d+)/) || s.match(/(\d+)/);
    return m ? Number(m[1]) : null;
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const id = parseSonglistId(link);
      if (!id) throw new Error("无法解析歌单 ID");
      const r = await songlistApi.shared(id);
      const list: SongItem[] = (r.data?.songs || []).map(
        (s: Record<string, unknown>) => ({
          song_id: (s.song_id as number) || (s.id as number),
          song_type: (s.song_type as number) || 0,
          name: (s.name as string) || (s.song_name as string) || "",
          singer: (s.singer as string) || "",
          labels: (s.labels as string[]) || [],
        })
      );
      setSongs(list);
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
            <p className="hint">已登录 QQ 音乐（加载"我喜欢"待接入）</p>
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
            <span>已加载 {songs.length} 首</span>
            <button className="btn" onClick={start} disabled={loading}>
              开始分类
            </button>
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
