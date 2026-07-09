import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Share2, Copy, Music } from "lucide-react";
import { profileApi } from "@/api";
import { useProfileStream } from "@/hooks/useProfileStream";
import { useProfileQueue } from "@/stores/profileQueue";
import { errMsg } from "@/lib/error";
import { config } from "@/config";
import type { ProfileData, ProfileCluster, ShareToken } from "@/types";
import Spinner from "@/components/Spinner";
import RadarChartTeal from "@/components/Charts/RadarChartTeal";
import ArtistBarTeal from "@/components/Charts/ArtistBarTeal";
import StyleClusterCard from "@/components/StyleClusterCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 根据 weight 决定标签的 font-weight class */
const weightClass = (w: number): string => {
  if (w >= 70) return "font-bold";
  if (w >= 40) return "font-semibold";
  return "font-medium";
};

/** 根据 weight 决定 teal 色阶（文字颜色） */
const weightColor = (w: number): string => {
  // scale: lighter → darker based on weight
  if (w >= 80) return "text-teal-700 dark:text-teal-300";
  if (w >= 60) return "text-teal-600 dark:text-teal-400";
  if (w >= 40) return "text-teal-500 dark:text-teal-400";
  return "text-teal-400 dark:text-teal-500";
};

/** 计算生成时间距现在的描述 */
const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
};

// ---- 进度阶段 → 中文描述 ----
const stageLabel: Record<string, string> = {
  fetch_labels: "拉取歌曲标签",
  aggregating: "聚合数据",
  ai_personality: "AI 分析听歌人格",
  ai_clusters: "AI 分析风格簇",
  done: "完成",
};

export default function Profile() {
  const nav = useNavigate();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [cachedProfile, setCachedProfile] = useState<ProfileData | null>(null);
  const [cachedGeneratedAt, setCachedGeneratedAt] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTokens, setShareTokens] = useState<ShareToken[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);

  const stream = useProfileStream(threadId);
  const enqueue = useProfileQueue((s) => s.enqueue);

  // 从 stream 或缓存获取显示用数据
  const profile = stream.profileData || cachedProfile;
  const generatedAt = stream.profileData
    ? stream.profileData.generated_at
    : cachedGeneratedAt;

  // 加载：检查是否有已有画像结果
  const checkExisting = useCallback(async () => {
    try {
      // 无 thread_id，只能等用户点击生成
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkExisting();
  }, [checkExisting]);

  // 生成按钮
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await profileApi.generate();
      setThreadId(r.data.thread_id);
    } catch (e) {
      toast.error(errMsg(e, "启动失败"));
      setGenerating(false);
    }
  };

  // 监听 stream done → 取消 generating
  useEffect(() => {
    if (stream.done) {
      setGenerating(false);
      setThreadId(null);
      if (stream.profileData) {
        setCachedProfile(stream.profileData);
        setCachedGeneratedAt(stream.profileData.generated_at);
      }
    }
  }, [stream.done, stream.profileData]);

  // 打开分享弹窗：加载 tokens + 构造分享链接
  const openShare = async () => {
    try {
      const r = await profileApi.listShareTokens();
      const tokens = r.data.tokens;
      setShareTokens(tokens);
      if (tokens.length > 0) {
        setShareUrl(
          `${window.location.origin}/profile/shared/${tokens[tokens.length - 1].token}`
        );
      } else {
        // 创建新 token
        const cr = await profileApi.createShareToken();
        setShareUrl(`${window.location.origin}/profile/shared/${cr.data.token}`);
        setShareTokens([cr.data]);
      }
      setShareDialogOpen(true);
    } catch (e) {
      toast.error(errMsg(e, "创建分享链接失败"));
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("已复制分享链接");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      await profileApi.revokeShareToken(token);
      setShareTokens((prev) => prev.filter((t) => t.token !== token));
      toast.success("分享链接已吊销");
    } catch (e) {
      toast.error(errMsg(e, "吊销失败"));
    }
  };

  const handleRefresh = async () => {
    setRefreshDialogOpen(false);
    setCachedProfile(null);
    setCachedGeneratedAt(null);
    await handleGenerate();
  };

  const handleOpenAsPlaylist = (cluster: ProfileCluster) => {
    if (cluster.songs.length === 0) {
      toast.error("该簇没有歌曲数据");
      return;
    }
    enqueue(cluster);
    nav("/songlist");
  };

  // 计算缺失标签比率（简化版：只看 radar 是否为空判断"
  const isPartial = profile && profile.radar.length === 0 && profile.tags.length === 0;
  const hasClusters = profile && profile.clusters.length > 0;

  // ---- 渲染 ----

  // 初始态：还未生成
  if (!profile && !stream.loading && !generating) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
        <section className="flex flex-col gap-3 pt-4">
          <h1 className="text-3xl font-bold tracking-tight">你的听歌画像</h1>
          <p className="text-muted-foreground">
            AI 根据你的收藏歌曲，生成听歌人格、风格簇和标签云
          </p>
        </section>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Music className="size-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              生成你的专属听歌画像，看看 AI 如何描述你的音乐品味
            </p>
            <Button onClick={handleGenerate} disabled={generating}>
              <Sparkles className="size-4" />
              生成画像
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 加载中（SSE 流）
  if ((stream.loading || generating) && !stream.profileData && !stream.error) {
    const stage = stream.stage || "fetch_labels";
    const pct = stage === "fetch_labels"
      ? Math.min(100, Math.round(Math.random() * 60))
      : stage === "aggregating"
      ? 60
      : stage === "ai_personality"
      ? 75
      : stage === "ai_clusters"
      ? 90
      : 100;

    return (
      <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
        <section className="flex flex-col gap-3 pt-4">
          <h1 className="text-3xl font-bold tracking-tight">你的听歌画像</h1>
        </section>
        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <Spinner />
            <div className="w-full max-w-xs">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {stageLabel[stage] || stage} {stream.detail && `· ${stream.detail}`}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // SSE 错误
  if (stream.error && !profile) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
        <section className="flex flex-col gap-3 pt-4">
          <h1 className="text-3xl font-bold tracking-tight">你的听歌画像</h1>
        </section>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-destructive">{stream.error}</p>
            <Button onClick={handleGenerate}>重试</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Profile 已加载 — 完整展示
  return (
    <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
      {/* Hero */}
      <section className="flex flex-col gap-3 pt-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-3xl font-bold tracking-tight">你的听歌画像</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshDialogOpen(true)}
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
            <Button size="sm" onClick={openShare}>
              <Share2 className="size-4" />
              分享
            </Button>
          </div>
        </div>
        {generatedAt && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-xs w-fit">
            生成于 {timeAgo(generatedAt)}
          </span>
        )}
      </section>

      {/* 歌曲太少提示（从后端返回 error） */}
      {profile && (profile as unknown as Record<string, unknown>).error === "songs_too_few" && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">歌曲太少，至少需要 10 首</p>
          </CardContent>
        </Card>
      )}

      {/* Partial 数据警告 */}
      {isPartial && (
        <Card className="border-yellow-500">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              标签数据不全，已跳过雷达/人格/风格簇
            </p>
          </CardContent>
        </Card>
      )}

      {/* AI 人格卡片 */}
      {profile?.personality && !isPartial && (
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="pt-6">
            <blockquote className="text-base leading-relaxed italic text-card-foreground">
              &ldquo;{profile.personality}&rdquo;
            </blockquote>
            <p className="text-xs text-muted-foreground mt-3">&mdash; AI 听歌人格</p>
          </CardContent>
        </Card>
      )}

      {/* 风格簇建议 */}
      {hasClusters && !isPartial && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="size-5 text-teal-500" />
            AI 建议歌单
          </h2>
          <div className="flex flex-col gap-3" role="list">
            {profile!.clusters.map((cluster) => (
              <StyleClusterCard
                key={cluster.name}
                cluster={cluster}
                onOpenAsPlaylist={handleOpenAsPlaylist}
              />
            ))}
          </div>
          {profile!.clusters.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-muted-foreground">暂无分类建议，你的听歌口味较均匀</p>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* Charts */}
      {!isPartial && profile && profile.radar.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">数据看板</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">听歌维度</CardTitle>
                <CardDescription>基于收藏歌曲的 AI 分析</CardDescription>
              </CardHeader>
              <CardContent>
                <RadarChartTeal data={profile.radar} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">常听歌手</CardTitle>
                <CardDescription>按歌曲数量排序</CardDescription>
              </CardHeader>
              <CardContent>
                <ArtistBarTeal data={profile.artists} />
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* 标签云 */}
      {profile && profile.tags.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">标签云</h2>
          <Card>
            <CardContent className="flex flex-wrap gap-x-3 gap-y-2 pt-6">
              {profile.tags.slice(0, config.profileTagCloudMax).map((tag) => (
                <span
                  key={tag.tag}
                  className={`${weightClass(tag.weight)} ${weightColor(tag.weight)} text-base`}
                >
                  {tag.tag}
                </span>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* 分享弹窗 */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>分享听歌画像</DialogTitle>
            <DialogDescription>
              分享链接有效期为 7 天，可随时吊销
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md break-all text-sm">
              <span className="flex-1 min-w-0">{shareUrl}</span>
              <Button variant="ghost" size="icon-sm" onClick={handleCopy} aria-label="复制链接">
                <Copy className="size-4" />
              </Button>
            </div>
            {shareTokens.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">已创建的分享：</p>
                {shareTokens.map((t) => (
                  <div
                    key={t.token}
                    className="flex items-center justify-between gap-2 p-2 bg-background border rounded-md"
                  >
                    <span className="text-xs text-muted-foreground truncate">
                      {t.token.slice(0, 12)}...
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRevoke(t.token)}
                    >
                      吊销
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 刷新确认弹窗 */}
      <Dialog open={refreshDialogOpen} onOpenChange={setRefreshDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认刷新</DialogTitle>
            <DialogDescription>
              重新生成会消耗 AI 配额，已分享的链接不受影响
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefreshDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRefresh}>继续</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
