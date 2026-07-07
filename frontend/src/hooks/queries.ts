import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { authApi, classifyApi, isLoggedIn, qqApi, settingsApi, songlistApi } from "@/api";
import { useClassifyStore } from "@/stores/classify";
import { toast } from "sonner";
import type {
  ClassifyFailedEvent,
  ClassifyProgressEvent,
  ClassifyReadyEvent,
  DragFeedback,
  ProxyConfigUpdate,
  ProxyTestRequest,
  ProxyTestResult,
  SongItem,
} from "@/types";

// ===== Auth =====

export function useMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      if (!isLoggedIn()) return null;
      const r = await authApi.me();
      return r.data;
    },
    retry: false,
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      authApi.login(data),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: {
      email: string;
      password: string;
      invite_code?: string;
    }) => authApi.register(data),
  });
}

// ===== QQ =====

export function useQqStatus() {
  return useQuery({
    queryKey: ["qq", "status"],
    queryFn: () => qqApi.status().then((r) => r.data),
    retry: false,
  });
}

// ===== Songlist =====

// TODO(后期恢复): 粘贴分享链接入口，见 git history v0.5.7
// export function useSonglistShared() {
//   return useMutation({
//     mutationFn: (songlistId: number) => songlistApi.shared(songlistId),
//   });
// }

export function useSubscribeFavorite() {
  return useMutation({
    mutationFn: () => songlistApi.subscribeFavorite(),
  });
}

// ===== Classify =====

export function useClassifyStart() {
  return useMutation({
    mutationFn: (songs: SongItem[]) => classifyApi.start(songs),
  });
}

/** 拉取分类 state 并同步到 store */
export function useClassifyState(threadId: string) {
  const setFromState = useClassifyStore((s) => s.setFromState);
  return useQuery({
    queryKey: ["classify", threadId],
    queryFn: async () => {
      const r = await classifyApi.state(threadId);
      setFromState(threadId, r.data);
      return r.data;
    },
    retry: false,
  });
}

export function useClassifyFeedback(threadId: string) {
  const setFromState = useClassifyStore((s) => s.setFromState);
  const clearDragLog = useClassifyStore((s) => s.clearDragLog);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      feedback_text?: string;
      feedback_drag?: DragFeedback[];
    }) => classifyApi.feedback(threadId, data),
    onSuccess: (r) => {
      setFromState(threadId, r.data);
      clearDragLog();
      // finalized 后服务端状态已变，触发 refetch
      if (r.data.status === "finalized") {
        qc.invalidateQueries({ queryKey: ["classify", threadId] });
      }
    },
  });
}

export function useClassifyConfirm(threadId: string) {
  const setResults = useClassifyStore((s) => s.setResults);
  return useMutation({
    mutationFn: (data: { dirname_template?: string }) =>
      classifyApi.confirm(threadId, data),
    onSuccess: (r) => setResults(r.data.results),
  });
}

export function useClassifyCancel(threadId: string) {
  return useMutation({
    mutationFn: () => classifyApi.cancel(threadId),
  });
}

/** 订阅分类 SSE 流：分批进度 + 就绪 + 失败 */
export function useClassifyStream(threadId: string) {
  const setFromState = useClassifyStore((s) => s.setFromState);
  const setProgress = useClassifyStore((s) => s.setProgress);
  const setStreamError = useClassifyStore((s) => s.setStreamError);
  useEffect(() => {
    const es = new EventSource(classifyApi.streamUrl(threadId));
    es.addEventListener("classify_progress", (e: MessageEvent) => {
      const d = JSON.parse(e.data) as ClassifyProgressEvent;
      setProgress({ completed: d.completed, total: d.total });
    });
    es.addEventListener("classify_ready", (e: MessageEvent) => {
      const d = JSON.parse(e.data) as ClassifyReadyEvent;
      setFromState(threadId, {
        thread_id: threadId,
        status: d.status,
        proposal: d.proposal,
        iteration: d.iteration,
      });
      setProgress(null);
      es.close();
    });
    es.addEventListener("classify_failed", (e: MessageEvent) => {
      const d = JSON.parse(e.data) as ClassifyFailedEvent;
      setStreamError(d.error || "分类失败");
      setProgress(null);
      es.close();
    });
    es.onerror = () => {
      // 不直接 setStreamError，避免正常 close 也触发；由 ready/failed 事件驱动
    };
    return () => es.close();
  }, [threadId, setFromState, setProgress, setStreamError]);
}

// ===== Settings =====

export function useProxyConfig() {
  return useQuery({
    queryKey: ["settings", "proxy"],
    queryFn: () => settingsApi.getProxy().then((r) => r.data),
    retry: false,
  });
}

export function useSaveProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProxyConfigUpdate) =>
      settingsApi.saveProxy(data).then((r) => r.data),
    onSuccess: () => {
      toast.success("代理配置已保存");
      qc.invalidateQueries({ queryKey: ["settings", "proxy"] });
    },
  });
}

export function useTestProxy() {
  return useMutation({
    mutationFn: (data: ProxyTestRequest) =>
      settingsApi.testProxy(data).then((r) => r.data as ProxyTestResult),
  });
}
