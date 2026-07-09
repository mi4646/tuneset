import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { profileApi } from "@/api";
import { errMsg } from "@/lib/error";
import { config } from "@/config";
import type { SharedProfileResponse } from "@/types";
import BrandMark from "@/components/BrandMark";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** 根据 weight 决定 font-weight */
const weightClass = (w: number): string => {
  if (w >= 70) return "font-bold";
  if (w >= 40) return "font-semibold";
  return "font-medium";
};

/** 根据 weight 决定 teal 色阶 */
const weightColor = (w: number): string => {
  if (w >= 80) return "text-teal-700 dark:text-teal-300";
  if (w >= 60) return "text-teal-600 dark:text-teal-400";
  if (w >= 40) return "text-teal-500 dark:text-teal-400";
  return "text-teal-400 dark:text-teal-500";
};

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

// Lazy-load chart components (keep shared page bundle small)
const RadarChartTeal = React.lazy(() => import("@/components/Charts/RadarChartTeal"));
const ArtistBarTeal = React.lazy(() => import("@/components/Charts/ArtistBarTeal"));

const chartSkeleton = <div className="h-[300px] animate-pulse bg-muted rounded" />;

export default function ProfileShared() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("无效的分享链接");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await profileApi.sharedProfile(token);
        setData(r.data);
      } catch (e) {
        setError(errMsg(e, "分享链接已失效或不存在"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 加载中
  if (loading) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        <header className="px-8 py-4 border-b">
          <BrandMark />
        </header>
        <main className="flex-1 w-full max-w-2xl mx-auto p-8 flex justify-center">
          {chartSkeleton}
        </main>
      </div>
    );
  }

  // 失效/错误
  if (error || !data) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        <header className="px-8 py-4 border-b">
          <BrandMark />
        </header>
        <main className="flex-1 w-full max-w-2xl mx-auto p-8 flex justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{error || "分享链接已失效或不存在"}</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const { profile, shared_by, generated_at } = data;
  const isPartial = profile.radar.length === 0 && profile.tags.length === 0;
  const hasClusters = profile.clusters.length > 0;

  return (
    <div className="min-h-svh flex flex-col bg-background">
      {/* header */}
      <header className="px-8 py-4 border-b">
        <BrandMark />
      </header>

      {/* banner */}
      <div className="bg-muted/50 border-b px-8 py-2 text-center text-xs text-muted-foreground">
        这是 {shared_by} 分享的听歌画像快照
        {generated_at && `（生成于 ${timeAgo(generated_at)}）`}
      </div>

      <main className="flex-1 w-full max-w-2xl mx-auto p-8 flex flex-col gap-8">
        {/* Personality */}
        {profile.personality && !isPartial && (
          <Card className="border-l-4 border-l-teal-500">
            <CardContent className="pt-6">
              <blockquote className="text-base leading-relaxed italic text-card-foreground">
                &ldquo;{profile.personality}&rdquo;
              </blockquote>
              <p className="text-xs text-muted-foreground mt-3">&mdash; AI 听歌人格</p>
            </CardContent>
          </Card>
        )}

        {/* 风格簇 (no actions) */}
        {hasClusters && !isPartial && (
          <section className="flex flex-col gap-3" aria-label="AI 建议歌单">
            <h2 className="text-lg font-semibold">AI 建议歌单</h2>
            <div className="flex flex-col gap-3">
              {profile.clusters.map((c) => (
                <Card
                  key={c.name}
                  className="border-l-4 border-l-teal-500 overflow-hidden"
                >
                  <CardContent className="pt-6 flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {c.insight}
                    </p>
                    {c.song_count > 0 && (
                      <p className="text-xs text-muted-foreground">{c.song_count} 首</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Charts */}
        {!isPartial && profile.radar.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">数据看板</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">听歌维度</CardTitle>
                </CardHeader>
                <CardContent>
                  <React.Suspense fallback={chartSkeleton}>
                    <RadarChartTeal data={profile.radar} />
                  </React.Suspense>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">常听歌手</CardTitle>
                </CardHeader>
                <CardContent>
                  <React.Suspense fallback={chartSkeleton}>
                    <ArtistBarTeal data={profile.artists} />
                  </React.Suspense>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Tag cloud */}
        {profile.tags.length > 0 && (
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

        {/* Footer CTA */}
        <footer className="mt-auto text-center pb-8">
          <p className="text-sm text-muted-foreground">
            <Link to="/profile" className="text-primary hover:underline">
              用 TuneSet 生成你的画像
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
