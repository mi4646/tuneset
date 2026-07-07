import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Music, QrCode } from "lucide-react";
import {
  useQqStatus,
  useSubscribeFavorite,
  // TODO(后期恢复): 粘贴分享链接入口，见 git history v0.5.7
  // useSonglistShared,
  useClassifyStart,
} from "@/hooks/queries";
import { useClassifyStore } from "@/stores/classify";
import { errMsg } from "@/lib/error";
import { songlistApi } from "@/api";
import { config } from "@/config";
import type { SongItem } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// TODO(后期恢复): 粘贴分享链接入口，见 git history v0.5.7
// import { Input } from "@/components/ui/input";

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
  // TODO(后期恢复): 粘贴分享链接入口，见 git history v0.5.7
  // const [link, setLink] = useState("");
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pushInterval, setPushInterval] = useState(300);
  const [streaming, setStreaming] = useState(false);
  const nav = useNavigate();

  const { data: qqStatus, isLoading: qqLoading } = useQqStatus();
  const hasQq = qqStatus?.bound ?? false;

  const subscribeMu = useSubscribeFavorite();
  // TODO(后期恢复): 粘贴分享链接入口，见 git history v0.5.7
  // const sharedMu = useSonglistShared();
  const startMu = useClassifyStart();
  const setSongNames = useClassifyStore((s) => s.setSongNames);

  const evtRef = useRef<EventSource | null>(null);

  // TODO(后期恢复): 粘贴分享链接入口，见 git history v0.5.7
  // const parseSonglistId = (s: string): number | null => {
  //   const m = s.match(/id=(\d+)/) || s.match(/(\d+)/);
  //   return m ? Number(m[1]) : null;
  // };

  // 订阅"我喜欢"实时推送：subscribe 拿 stream_id + 首批数据，EventSource 接收后续更新
  const subscribeFav = async () => {
    setLoading(true);
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
            toast.error(`推送失败：${data.error}`);
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
        toast.error("实时推送已断开，点刷新重试");
      };
      evtRef.current = es;
    } catch (e: unknown) {
      toast.error(errMsg(e, "加载失败"));
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

  // TODO(后期恢复): 粘贴分享链接入口，见 git history v0.5.7
  // const load = async () => {
  //   setLoading(true);
  //   try {
  //     const id = parseSonglistId(link);
  //     if (!id) throw new Error("无法解析歌单 ID");
  //     const r = await sharedMu.mutateAsync(id);
  //     setSongs(parseSongItems(r.data?.songs || []));
  //     setLoaded(true);
  //   } catch (e: unknown) {
  //     toast.error(errMsg(e, "加载失败"));
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const start = async () => {
    if (songs.length > config.classifyMaxSongs) {
      toast.error(`超过单次上限 ${config.classifyMaxSongs} 首，请筛选后再分类`);
      return;
    }
    setLoading(true);
    try {
      setSongNames(songs);
      const r = await startMu.mutateAsync(songs);
      nav(`/classify/${r.data.thread_id}`);
    } catch (e: unknown) {
      toast.error(errMsg(e, "启动分类失败"));
    } finally {
      setLoading(false);
    }
  };

  const intervalText =
    pushInterval >= 60
      ? `每 ${Math.round(pushInterval / 60)} 分钟自动刷新`
      : `每 ${pushInterval} 秒自动刷新`;

  const showSkeleton = qqLoading || (hasQq && loading && songs.length === 0);
  const showEmpty = hasQq && loaded && songs.length === 0 && !loading;
  const showList = songs.length > 0;

  return (
    <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
      {/* hero */}
      <section className="flex flex-col gap-3 pt-4">
        <h1 className="text-3xl font-bold tracking-tight">整理你的歌单</h1>
        <p className="text-muted-foreground">
          AI 帮你分类 QQ 音乐「我喜欢」，按 song_id 精确建歌单，版本一致不串味。
        </p>
      </section>

      {/* 未绑 QQ：绑定引导卡（消解靶子4） */}
      {!hasQq && !qqLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-5 text-primary" />
              绑定 QQ 音乐
            </CardTitle>
            <CardDescription>
              绑定后可加载「我喜欢」歌单，并实时同步新增的歌曲
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/qr">
                <QrCode className="size-4" />
                去扫码绑定
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 加载中：骨架列表卡（消解靶子3 呈现面） */}
      {showSkeleton && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <span className="font-medium">
              {qqLoading ? "正在确认 QQ 绑定状态…" : "正在加载你的「我喜欢」…"}
            </span>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[40px_1fr_auto] items-center gap-4 px-4 py-2 border-b last:border-b-0"
              >
                <div className="h-4 rounded bg-muted animate-pulse" />
                <div className="h-4 rounded bg-muted animate-pulse" />
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 空歌单 */}
      {showEmpty && (
        <p className="text-muted-foreground text-center p-4">该歌单没有歌曲</p>
      )}

      {/* 已加载：歌曲列表卡（消解靶子2 空感 + 靶子7 图标） */}
      {showList && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <span className="font-medium flex items-center gap-2">
              已加载 {songs.length} 首
              {streaming && hasQq && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-xs font-normal">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  实时同步中 · {intervalText}
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
                <span className="truncate font-medium flex items-center gap-2">
                  <Music className="size-4 text-muted-foreground shrink-0" />
                  {s.name}
                </span>
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
