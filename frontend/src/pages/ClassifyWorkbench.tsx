import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  useClassifyState,
  useClassifyFeedback,
  useClassifyConfirm,
  useClassifyCancel,
  useClassifyStream,
} from "@/hooks/queries";
import { useClassifyStore } from "@/stores/classify";
import { errMsg } from "@/lib/error";
import { config } from "@/config";
import type { ProposalItem } from "@/types";
import Spinner from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SongCard({ item, name }: { item: ProposalItem; name?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(item.song_id),
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2 bg-background border rounded-md cursor-grab touch-none select-none transition-shadow ${
        isDragging ? "opacity-60 cursor-grabbing shadow-lg" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="text-sm font-medium truncate">
        {name || `#${item.song_id}`}
      </div>
      {item.reason && (
        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {item.reason}
        </div>
      )}
    </div>
  );
}

function Category({
  category,
  items,
  names,
}: {
  category: string;
  items: ProposalItem[];
  names: Map<number, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: category });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors ${
        isOver ? "border-primary bg-accent" : ""
      }`}
    >
      <h3 className="font-semibold text-base">
        {category}（{items.length}）
      </h3>
      <div className="flex flex-col gap-2 min-h-12">
        {items.map((it) => (
          <SongCard key={it.song_id} item={it} name={names.get(it.song_id)} />
        ))}
        {items.length === 0 && (
          <div className="p-3 text-center text-muted-foreground text-sm border border-dashed rounded-md">
            拖入歌曲
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClassifyWorkbench() {
  const { threadId } = useParams<{ threadId: string }>();
  const nav = useNavigate();
  const tid = threadId!;

  const {
    items,
    iteration,
    status,
    dragLog,
    results,
    songNames,
    progress,
    streamError,
    moveItem,
    reset,
  } = useClassifyStore();
  const { isLoading: loading, error: queryErr } = useClassifyState(tid);
  const feedbackMu = useClassifyFeedback(tid);
  const confirmMu = useClassifyConfirm(tid);
  const cancelMu = useClassifyCancel(tid);
  useClassifyStream(tid);
  const [feedback, setFeedback] = useState("");

  const submitting = feedbackMu.isPending || confirmMu.isPending;
  const rawErr = queryErr ?? feedbackMu.error ?? confirmMu.error;
  const err = rawErr ? errMsg(rawErr) : "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const groups = useMemo(() => {
    const g: Record<string, ProposalItem[]> = {};
    items.forEach((it) => {
      (g[it.category] ||= []).push(it);
    });
    return g;
  }, [items]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    moveItem(Number(active.id), String(over.id));
  };

  const atMax = iteration >= config.classifyMaxIterations;
  const canConfirm = status === "finalized";

  // 结果展示（不变）
  if (results) {
    return (
      <div className="flex justify-center">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="text-center">建歌单结果</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-2 bg-background border rounded-md"
              >
                <span className="font-medium">{r.category}</span>
                <span className="text-muted-foreground text-sm">
                  歌单 ID: {r.dirid}
                </span>
                <span
                  className={
                    r.added
                      ? "text-primary font-medium"
                      : "text-destructive font-medium"
                  }
                >
                  {r.added ? "✓ 成功" : "✗ 失败"}
                </span>
              </div>
            ))}
            <Button
              className="mt-2"
              onClick={() => {
                reset();
                nav("/songlist");
              }}
            >
              完成
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // SSE 失败：显示错误 + 取消按钮
  if (streamError) {
    return (
      <div className="flex flex-col gap-4 items-start">
        <p className="text-sm text-destructive">{streamError}</p>
        <Button
          variant="outline"
          onClick={() => {
            reset();
            nav("/songlist");
          }}
        >
          取消
        </Button>
      </div>
    );
  }

  // 分类进行中：分批进度或启动中
  if (status === "running") {
    if (progress) {
      return (
        <div className="flex justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="flex items-center justify-center gap-3">
              <Spinner />
              <span className="text-sm">
                正在分类 {progress.completed}/{progress.total} 批…
              </span>
            </CardContent>
          </Card>
        </div>
      );
    }
    return <Spinner label="分类启动中…" />;
  }

  // 初次加载且无 items（非 running 态）
  if (loading && items.length === 0) return <Spinner label="加载中…" />;

  const submitFeedback = async () => {
    try {
      await feedbackMu.mutateAsync({
        feedback_text: feedback,
        feedback_drag: dragLog,
      });
    } catch {
      // err 由 mutation.error 反映
    }
  };

  const confirm = async () => {
    try {
      await confirmMu.mutateAsync({});
    } catch {
      // err 由 mutation.error 反映
    }
  };

  const cancel = async () => {
    try {
      await cancelMu.mutateAsync();
    } catch {
      // ignore
    }
    reset();
    nav("/songlist");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">分类工作台</h1>
        <span className="inline-flex items-center rounded-full bg-accent text-accent-foreground px-3 py-1 text-sm font-medium">
          第 {iteration}/{config.classifyMaxIterations} 轮
        </span>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 items-start">
          {Object.entries(groups).map(([cat, items]) => (
            <Category key={cat} category={cat} items={items} names={songNames} />
          ))}
        </div>
      </DndContext>

      {dragLog.length > 0 && (
        <p className="text-sm text-muted-foreground">
          已记录 {dragLog.length} 处拖拽调整
        </p>
      )}

      <Textarea
        placeholder="反馈：如把某首歌改到另一类"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
      />

      <div className="flex gap-2 flex-wrap">
        <Button onClick={submitFeedback} disabled={submitting || canConfirm}>
          {atMax ? "生成建歌单计划" : "提交反馈（重新分类）"}
        </Button>
        <Button onClick={confirm} disabled={submitting || !canConfirm}>
          确认建歌单
        </Button>
        <Button variant="outline" onClick={cancel} disabled={submitting}>
          取消
        </Button>
      </div>

      {!canConfirm && (
        <p className="text-sm text-muted-foreground">
          {atMax
            ? "已达轮次上限，提交后将生成建歌单计划"
            : "拖拽歌曲调整分类，附文字反馈后提交，AI 将重新分类"}
        </p>
      )}
    </div>
  );
}
