import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { classifyApi, getCredential } from "../api";
import type { ProposalItem } from "../types";

export default function ClassifyWorkbench() {
  const { threadId } = useParams<{ threadId: string }>();
  const nav = useNavigate();
  const [proposal, setProposal] = useState<ProposalItem[]>([]);
  const [iteration, setIteration] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const r = await classifyApi.state(threadId!);
      setProposal(r.data.proposal || []);
      setIteration(r.data.iteration || 0);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(msg || "加载失败");
    }
  };

  useEffect(() => { load(); }, []);

  const submitFeedback = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await classifyApi.feedback(threadId!, { feedback_text: feedback });
      setProposal(r.data.proposal || []);
      setIteration(r.data.iteration || 0);
      setFeedback("");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(msg || "提交失败");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setLoading(true);
    setErr("");
    try {
      const cred = getCredential();
      if (!cred) { setErr("请先扫码登录 QQ 音乐"); return; }
      const r = await classifyApi.confirm(threadId!, { credential: cred });
      alert("建歌单结果: " + JSON.stringify(r.data.results));
      nav("/songlist");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(msg || "确认失败");
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    await classifyApi.cancel(threadId!);
    nav("/songlist");
  };

  const groups: Record<string, ProposalItem[]> = {};
  proposal.forEach((p) => {
    (groups[p.category] = groups[p.category] || []).push(p);
  });

  return (
    <div>
      <h1>分类工作台（第 {iteration} 轮）</h1>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat} style={{ border: "1px solid #ccc", margin: 8, padding: 8, minWidth: 200 }}>
            <h3>{cat}（{items.length}）</h3>
            {items.map((s) => <div key={s.song_id}>{s.reason}</div>)}
          </div>
        ))}
      </div>
      <textarea placeholder="反馈：如把 X 改到 Y 类" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} style={{ width: 400 }} />
      <div>
        <button onClick={submitFeedback} disabled={loading}>提交反馈（重新分类）</button>
        <button onClick={confirm} disabled={loading}>确认建歌单</button>
        <button onClick={cancel} disabled={loading}>取消</button>
      </div>
      {err && <p style={{ color: "red" }}>{err}</p>}
    </div>
  );
}
