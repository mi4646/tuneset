import { create } from "zustand";
import { classifyApi } from "@/api";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import type { ProfileCluster } from "@/types";

interface QueueItem {
  cluster: ProfileCluster;
  status: "pending" | "running" | "done" | "failed";
  error?: string;
}

interface ProfileQueueState {
  queue: QueueItem[];
  enqueue: (cluster: ProfileCluster) => void;
  /** 尝试处理队列中下一个 pending 项 */
  processNext: () => void;
  clear: () => void;
}

export const useProfileQueue = create<ProfileQueueState>((set, get) => ({
  queue: [],

  enqueue: (cluster) => {
    set((s) => ({
      queue: [...s.queue, { cluster, status: "pending" }],
    }));
    // 如果当前没有 running 项，触发处理
    const hasRunning = get().queue.some((q) => q.status === "running");
    if (!hasRunning) {
      get().processNext();
    }
  },

  processNext: async () => {
    const next = get().queue.find((q) => q.status === "pending");
    if (!next) return;

    set((s) => ({
      queue: s.queue.map((q) =>
        q.cluster.name === next.cluster.name ? { ...q, status: "running" } : q
      ),
    }));

    try {
      // 需要取实际的 song list
      const songs = next.cluster.songs.map((s) => ({
        song_id: s.song_id,
        song_type: 0,
        name: s.name,
        singer: s.singer,
      }));
      await classifyApi.start(songs);
      set((s) => ({
        queue: s.queue.map((q) =>
          q.cluster.name === next.cluster.name ? { ...q, status: "done" } : q
        ),
      }));
      toast.success(`已启动分类: ${next.cluster.name}`);
    } catch (e) {
      const msg = errMsg(e, "启动分类失败");
      set((s) => ({
        queue: s.queue.map((q) =>
          q.cluster.name === next.cluster.name ? { ...q, status: "failed", error: msg } : q
        ),
      }));
      toast.error(msg);
    }

    // 处理下一个
    get().processNext();
  },

  clear: () => set({ queue: [] }),
}));
