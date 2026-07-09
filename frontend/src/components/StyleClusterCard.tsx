import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type { ProfileCluster } from "@/types";

interface StyleClusterCardProps {
  cluster: ProfileCluster;
  onOpenAsPlaylist: (cluster: ProfileCluster) => void;
}

export default function StyleClusterCard({
  cluster,
  onOpenAsPlaylist,
}: StyleClusterCardProps) {
  return (
    <Card
      className="border-l-4 border-l-teal-500 overflow-hidden"
      role="listitem"
      aria-label={`风格簇: ${cluster.name}`}
    >
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-teal-500 shrink-0" />
            <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
              AI 建议
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {cluster.insight}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 whitespace-nowrap"
          onClick={() => onOpenAsPlaylist(cluster)}
          aria-label={`把这 ${cluster.song_count} 首开成歌单`}
        >
          把这 {cluster.song_count} 首开成歌单
        </Button>
      </CardContent>
    </Card>
  );
}
