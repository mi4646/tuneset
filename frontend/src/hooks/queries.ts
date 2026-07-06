import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, classifyApi, isLoggedIn, qqApi, songlistApi } from "@/api";
import { useClassifyStore } from "@/stores/classify";
import type { DragFeedback, SongItem } from "@/types";

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

export function useSonglistShared() {
  return useMutation({
    mutationFn: (songlistId: number) => songlistApi.shared(songlistId),
  });
}

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
