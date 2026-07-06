import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  useQqStatus,
  useSubscribeFavorite,
  useSonglistShared,
  useClassifyStart,
} from "@/hooks/queries";
import { useClassifyStore } from "@/stores/classify";
import { errMsg } from "@/lib/error";
import { songlistApi } from "@/api";
import type { SongItem } from "@/types";
import Spinner from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

  const { data: qqStatus } = useQqStatus();
  const hasQq = qqStatus?.bound ?? false;

  const subscribeMu = useSubscribeFavorite();
  const sharedMu = useSonglistShared();
  const startMu = useClassifyStart();
  const setSongNames = useClassifyStore((s) => s.setSongNames);

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
      if (evtRef.current) {
        evtRef.current.close();
        evtRef.current = null;
      }
      setStreaming(false);
      const r = await subscribeMu.mutateAsync();
      setSongs(parseSongItems(r.data?.songs || []));
      setLoaded(true);
      setPushInterval(r.data?.interval || 300);
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
      setErr(errMsg(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  };

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
      const r = await sharedMu.mutateAsync(id);
      setSongs(parseSongItems(r.data?.songs || []));
      setLoaded(true);
    } catch (e: unknown) {
      setErr(errMsg(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  };

  const start = async () => {
    setLoading(true);
    setErr("");
    try {
      setSongNames(songs);
      const r = await startMu.mutateAsync(songs);
      nav(`/classify/${r.data.thread_id}`);
    } catch (e: unknown) {
      setErr(errMsg(e, "启动分类失败"));
    } finally {
      setLoading(false);
    }
  };

  const intervalText =
    pushInterval >= 60
      ? `每 ${Math.round(pushInterval / 60)} 分钟自动刷新`
      : `每 ${pushInterval} 秒自动刷新`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">选择歌单</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>粘贴分享链接</CardTitle>
            <CardDescription>输入 QQ 音乐歌单分享链接</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              placeholder="粘贴 QQ 音乐歌单分享链接"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="flex-1"
            />
            <Button onClick={load} disabled={loading || !link}>
              加载
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>扫码取"我喜欢"</CardTitle>
            <CardDescription>绑定 QQ 音乐后加载我喜欢</CardDescription>
          </CardHeader>
          <CardContent>
            {hasQq ? (
              <Button onClick={subscribeFav} disabled={loading}>
                加载我的喜欢
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/qr">去扫码登录</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {loading && songs.length === 0 && <Spinner label="加载中…" />}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {loaded && songs.length === 0 && !loading && (
        <p className="text-muted-foreground text-center p-4">该歌单没有歌曲</p>
      )}

      {songs.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <span className="font-medium">
              已加载 {songs.length} 首
              {streaming && hasQq && (
                <span className="text-muted-foreground text-sm">
                  {" "}
                  · {intervalText}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              {hasQq && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={subscribeFav}
                  disabled={loading}
                >
                  刷新
                </Button>
              )}
              <Button size="sm" onClick={start} disabled={loading}>
                开始分类
              </Button>
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {songs.map((s, i) => (
              <div
                key={i}
                className="grid grid-cols-[40px_1fr_auto] items-center gap-4 px-4 py-2 border-b last:border-b-0"
              >
                <span className="text-muted-foreground text-sm text-right">
                  {i + 1}
                </span>
                <span className="truncate font-medium">{s.name}</span>
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  {s.singer}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
