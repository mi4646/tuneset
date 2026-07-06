import { create } from "zustand";
import type {
  ConfirmResult,
  DragFeedback,
  ProposalItem,
  SongItem,
  StateResponse,
} from "@/types";

/**
 * 分类工作台状态。
 * 服务端数据由 TanStack Query 拉取后写入此 store；本地拖拽中间态、歌曲名缓存也在此。
 * 替代旧 useClassify 的散落 useState + sessionStorage["classify_songs"] 耦合。
 */
interface ClassifyState {
  threadId: string | null;
  items: ProposalItem[];
  iteration: number;
  status: string;
  plan: Record<string, unknown> | null;
  dragLog: DragFeedback[];
  results: ConfirmResult[] | null;
  /** 歌曲名缓存，song_id → name（替代 sessionStorage） */
  songNames: Map<number, string>;
  /** 分批分类进度（running 期间） */
  progress: { completed: number; total: number } | null;
  /** SSE 流错误（classify_failed 事件设置） */
  streamError: string | null;

  /** 服务端 state 写入（load / feedback 返回后调） */
  setFromState: (threadId: string, data: StateResponse) => void;
  /** 本地拖拽移动 + 记录 dragLog */
  moveItem: (songId: number, toCategory: string) => void;
  /** 提交反馈后清空 dragLog */
  clearDragLog: () => void;
  /** confirm 结果 */
  setResults: (r: ConfirmResult[]) => void;
  /** 启动分类时缓存歌曲名 */
  setSongNames: (songs: SongItem[]) => void;
  /** 设置分批进度（null 清除） */
  setProgress: (p: { completed: number; total: number } | null) => void;
  /** 设置 SSE 流错误（null 清除） */
  setStreamError: (e: string | null) => void;
  /** 重置（离开工作台） */
  reset: () => void;
}

const initial = {
  threadId: null as string | null,
  items: [] as ProposalItem[],
  iteration: 0,
  status: "",
  plan: null as Record<string, unknown> | null,
  dragLog: [] as DragFeedback[],
  results: null as ConfirmResult[] | null,
  songNames: new Map<number, string>(),
  progress: null as { completed: number; total: number } | null,
  streamError: null as string | null,
};

export const useClassifyStore = create<ClassifyState>((set) => ({
  ...initial,

  setFromState: (threadId, data) =>
    set({
      threadId,
      items: data.proposal || [],
      iteration: data.iteration || 0,
      status: data.status || "",
      plan: data.plan || null,
    }),

  moveItem: (songId, toCategory) =>
    set((s) => {
      const target = s.items.find((i) => i.song_id === songId);
      if (!target || target.category === toCategory) return s;
      const from = target.category;
      return {
        items: s.items.map((i) =>
          i.song_id === songId ? { ...i, category: toCategory } : i
        ),
        dragLog: [
          ...s.dragLog.filter((d) => d.song_id !== songId),
          { song_id: songId, from_category: from, to_category: toCategory },
        ],
      };
    }),

  clearDragLog: () => set({ dragLog: [] }),

  setResults: (r) => set({ results: r }),

  setSongNames: (songs) =>
    set({ songNames: new Map(songs.map((s) => [s.song_id, s.name])) }),

  setProgress: (p) => set({ progress: p }),

  setStreamError: (e) => set({ streamError: e }),

  reset: () => set({ ...initial, songNames: new Map() }),
}));
