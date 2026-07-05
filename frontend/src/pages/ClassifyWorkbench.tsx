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
import { useClassify } from "../hooks/useClassify";
import type { ProposalItem } from "../types";
import Spinner from "../components/Spinner";

function SongCard({
  item,
  name,
}: {
  item: ProposalItem;
  name?: string;
}) {
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
      className={`song-card ${isDragging ? "dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <div className="song-card-name">{name || `#${item.song_id}`}</div>
      {item.reason && <div className="song-card-reason">{item.reason}</div>}
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
    <div ref={setNodeRef} className={`category ${isOver ? "over" : ""}`}>
      <h3>
        {category}（{items.length}）
      </h3>
      <div className="category-body">
        {items.map((it) => (
          <SongCard key={it.song_id} item={it} name={names.get(it.song_id)} />
        ))}
        {items.length === 0 && <div className="category-empty">拖入歌曲</div>}
      </div>
    </div>
  );
}

export default function ClassifyWorkbench() {
  const { threadId } = useParams<{ threadId: string }>();
  const nav = useNavigate();
  const cls = useClassify(threadId!);
  const [feedback, setFeedback] = useState("");

  const names = useMemo(() => {
    const m = new Map<number, string>();
    try {
      const raw = sessionStorage.getItem("classify_songs");
      if (raw) {
        (JSON.parse(raw) as { song_id: number; name: string }[]).forEach((s) =>
          m.set(s.song_id, s.name)
        );
      }
    } catch {
      // 缓存缺失时降级显示 #song_id
    }
    return m;
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const groups = useMemo(() => {
    const g: Record<string, ProposalItem[]> = {};
    cls.items.forEach((it) => {
      (g[it.category] ||= []).push(it);
    });
    return g;
  }, [cls.items]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    cls.moveItem(Number(active.id), String(over.id));
  };

  if (cls.loading) return <Spinner label="加载中…" />;

  if (cls.results) {
    return (
      <div className="page">
        <div className="results-panel">
          <h1>建歌单结果</h1>
          {cls.results.map((r, i) => (
            <div key={i} className="result-row">
              <span className="result-cat">{r.category}</span>
              <span className="result-dirid">歌单 ID: {r.dirid}</span>
              <span className={`result-added ${r.added ? "ok" : "fail"}`}>
                {r.added ? "✓ 成功" : "✗ 失败"}
              </span>
            </div>
          ))}
          <button className="btn" onClick={() => nav("/songlist")}>
            完成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="workbench-head">
        <h1>分类工作台</h1>
        <div className="iter-badge">
          第 {cls.iteration}/{cls.MAX_ITERATIONS} 轮
        </div>
      </div>

      {cls.err && <div className="error-banner">{cls.err}</div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="classify-grid">
          {Object.entries(groups).map(([cat, items]) => (
            <Category key={cat} category={cat} items={items} names={names} />
          ))}
        </div>
      </DndContext>

      {cls.dragLog.length > 0 && (
        <p className="hint">已记录 {cls.dragLog.length} 处拖拽调整</p>
      )}

      <div className="feedback-row">
        <textarea
          className="input"
          placeholder="反馈：如把某首歌改到另一类"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
        />
      </div>

      <div className="actions">
        <button
          className="btn"
          onClick={() => cls.submitFeedback(feedback)}
          disabled={cls.submitting || cls.canConfirm}
        >
          {cls.atMax ? "生成建歌单计划" : "提交反馈（重新分类）"}
        </button>
        <button
          className="btn"
          onClick={cls.confirm}
          disabled={cls.submitting || !cls.canConfirm}
        >
          确认建歌单
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            cls.cancel();
            nav("/songlist");
          }}
          disabled={cls.submitting}
        >
          取消
        </button>
      </div>

      {!cls.canConfirm && (
        <p className="hint">
          {cls.atMax
            ? "已达轮次上限，提交后将生成建歌单计划"
            : "拖拽歌曲调整分类，附文字反馈后提交，AI 将重新分类"}
        </p>
      )}
    </div>
  );
}
