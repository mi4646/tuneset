import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { songlistApi, classifyApi } from "../api";
import type { SongItem } from "../types";

export default function SonglistInput() {
  const [link, setLink] = useState("");
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

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
      const list: SongItem[] = (r.data?.songs || []).map((s: Record<string, unknown>) => ({
        song_id: (s.song_id as number) || (s.id as number),
        song_type: (s.song_type as number) || 0,
        name: (s.name as string) || (s.song_name as string) || "",
        singer: (s.singer as string) || "",
        labels: (s.labels as string[]) || [],
      }));
      setSongs(list);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail
        || (e as { message?: string }).message || "加载失败";
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
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(msg || "启动分类失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>选择歌单</h1>
      <input placeholder="粘贴 QQ 音乐歌单分享链接" value={link} onChange={(e) => setLink(e.target.value)} style={{ width: 400 }} />
      <button onClick={load} disabled={loading}>加载</button>
      <p>已加载 {songs.length} 首</p>
      {songs.slice(0, 5).map((s, i) => <div key={i}>{s.name} - {s.singer}</div>)}
      <button onClick={start} disabled={loading || !songs.length}>开始分类</button>
      {err && <p style={{ color: "red" }}>{err}</p>}
    </div>
  );
}
