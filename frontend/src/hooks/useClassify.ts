import { useCallback, useEffect, useState } from "react";
import { classifyApi } from "../api";
import type { ConfirmResult, DragFeedback, ProposalItem } from "../types";
import { config } from "../config";

const MAX_ITERATIONS = config.classifyMaxIterations;

export function useClassify(threadId: string) {
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [iteration, setIteration] = useState(0);
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [dragLog, setDragLog] = useState<DragFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<ConfirmResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await classifyApi.state(threadId);
      setItems(r.data.proposal || []);
      setIteration(r.data.iteration || 0);
      setStatus(r.data.status || "");
      setPlan(r.data.plan || null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail;
      setErr(msg || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const submitFeedback = async (text: string) => {
    setSubmitting(true);
    setErr("");
    try {
      const r = await classifyApi.feedback(threadId, {
        feedback_text: text,
        feedback_drag: dragLog,
      });
      setItems(r.data.proposal || []);
      setIteration(r.data.iteration || 0);
      setStatus(r.data.status || "");
      setDragLog([]);
      if (r.data.status === "finalized") {
        await load();
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail;
      setErr(msg || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const confirm = async () => {
    setSubmitting(true);
    setErr("");
    try {
      const r = await classifyApi.confirm(threadId, {});
      setResults(r.data.results);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail;
      setErr(msg || "确认失败");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    await classifyApi.cancel(threadId);
  };

  const moveItem = (songId: number, toCategory: string) => {
    const target = items.find((i) => i.song_id === songId);
    if (!target || target.category === toCategory) return;
    const from = target.category;
    setItems((prev) =>
      prev.map((i) => (i.song_id === songId ? { ...i, category: toCategory } : i))
    );
    setDragLog((log) => [
      ...log.filter((d) => d.song_id !== songId),
      { song_id: songId, from_category: from, to_category: toCategory },
    ]);
  };

  const atMax = iteration >= MAX_ITERATIONS;
  const canConfirm = status === "finalized";

  return {
    items,
    iteration,
    status,
    plan,
    dragLog,
    loading,
    submitting,
    err,
    results,
    atMax,
    canConfirm,
    MAX_ITERATIONS,
    submitFeedback,
    confirm,
    cancel,
    moveItem,
  };
}
