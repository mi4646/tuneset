import { useEffect, useRef, useState, useCallback } from "react";
import { profileApi } from "@/api";
import type { ProfileData, ProfileProgressEvent } from "@/types";

interface ProfileStreamState {
  stage: string;
  detail: string;
  profileData: ProfileData | null;
  error: string | null;
  loading: boolean;
  done: boolean;
}

export function useProfileStream(threadId: string | null) {
  const [state, setState] = useState<ProfileStreamState>({
    stage: "",
    detail: "",
    profileData: null,
    error: null,
    loading: false,
    done: false,
  });
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fetchResult = useCallback(async (tid: string) => {
    try {
      const r = await profileApi.result(tid);
      setState((s) => ({ ...s, profileData: r.data, done: true, loading: false }));
    } catch (e) {
      // 结果可能还没就绪，重试
      timerRef.current = setTimeout(() => fetchResult(tid), 2000);
    }
  }, []);

  useEffect(() => {
    if (!threadId) return;
    cleanup();
    retriesRef.current = 0;
    setState({
      stage: "",
      detail: "",
      profileData: null,
      error: null,
      loading: true,
      done: false,
    });

    const connect = () => {
      const es = new EventSource(profileApi.streamUrl(threadId));
      esRef.current = es;

      es.addEventListener("profile_progress", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data) as ProfileProgressEvent;
          setState((s) => ({ ...s, stage: d.stage, detail: d.detail, loading: true }));
          if (d.stage === "done") {
            es.close();
            fetchResult(threadId);
          }
        } catch {
          // ignore parse errors
        }
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (retriesRef.current < 3) {
          retriesRef.current += 1;
          timerRef.current = setTimeout(connect, 2000);
        } else {
          setState((s) => ({
            ...s,
            error: "连接已断开，请刷新重试",
            loading: false,
          }));
        }
      };
    };

    connect();
    return cleanup;
  }, [threadId, cleanup, fetchResult]);

  return state;
}
