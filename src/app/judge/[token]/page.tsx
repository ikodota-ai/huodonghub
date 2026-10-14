"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, getFp, isWechat, contestantImg } from "@/lib/client";

interface JudgeData {
  voteId: string;
  voteName: string; roundName: string; roundStatus: string; groupName: string;
  kind: "score" | "vote"; maxScore: number; maxVotes: number; allowRepeat: number;
  voterName: string; needBind: boolean; wxConfigured: boolean; hasVoted: boolean;
  submitted: { contestantId: string; score: number | null }[];
  contestants: { id: string; number: string; name: string; intro: string | null; image: string | null }[];
}

export default function JudgePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<JudgeData | null>(null);
  const [error, setError] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [bindMsg, setBindMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<JudgeData>(`/api/judge/${token}`);
      setData(d);
      if (d.kind === "score") {
        const init: Record<string, number> = {};
        d.contestants.forEach((c) => { init[c.id] = 0; });
        setScores(init);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // 需要绑定时：有微信授权 cookie 或指纹 → 自动完成绑定
  useEffect(() => {
    if (!data?.needBind) return;
    if (data.wxConfigured && isWechat() && !document.cookie.includes(`wx_openid_${data.voteId}`)) {
      location.href = `/api/wx/${data.voteId}/auth?next=${encodeURIComponent(`/judge/${token}`)}`;
      return;
    }
    api(`/api/judge/${token}/bind`, { method: "POST", body: JSON.stringify({ fp: getFp() }) })
      .then(() => load())
      .catch((e) => setBindMsg((e as Error).message));
  }, [data, token, load]);

  async function submit() {
    setSubmitting(true);
    try {
      const body = data!.kind === "score"
        ? { scores: Object.entries(scores).map(([contestantId, score]) => ({ contestantId, score })), fp: getFp() }
        : { contestantIds: Array.from(picks), fp: getFp() };
      await api(`/api/judge/${token}`, { method: "POST", body: JSON.stringify(body) });
      await load(); // 重新拉取，拿到 submitted 明细用于回显
      setDone(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
      setConfirm(false);
    }
  }

  if (error) return <Center><p className="text-ink-500">{error}</p></Center>;
  if (!data) return <Center><Spinner /></Center>;

  if (done || data.hasVoted) {
    const submittedRows = data.submitted
      .map((s) => ({ ...s, contestant: data.contestants.find((c) => c.id === s.contestantId) }))
      .filter((s) => s.contestant);
    return (
      <Center>
        <div className="text-center w-full max-w-sm">
          <div className="w-20 h-20 rounded-full bg-green-100 text-green-600 text-4xl flex items-center justify-center mx-auto mb-4">✓</div>
          <h1 className="text-xl font-bold">已提交，感谢评审</h1>
          <p className="text-sm text-ink-300 mt-2">{data.voteName} · {data.roundName} · {data.groupName}</p>
          {submittedRows.length > 0 && (
            <div className="mt-5 bg-white rounded-xl shadow-card text-left divide-y divide-ink-100">
              <p className="px-4 py-2.5 text-xs text-ink-300">我的{data.kind === "score" ? "打分" : "投票"}明细（{data.voterName}）</p>
              {submittedRows.map((s) => (
                <div key={s.contestantId} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <span><span className="num text-ink-300 mr-1.5">{s.contestant!.number}</span>{s.contestant!.name}</span>
                  {s.score != null && <span className="num font-bold text-brand-700">{s.score} 分</span>}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-300 mt-5">评审已完成，请将设备交回工作人员</p>
        </div>
      </Center>
    );
  }

  if (data.needBind) {
    return (
      <Center>
        <div className="text-center">
          <Spinner />
          <p className="text-sm text-ink-500 mt-4">正在绑定您的身份…</p>
          {bindMsg && <p className="text-sm text-red-500 mt-2">{bindMsg}</p>}
        </div>
      </Center>
    );
  }

  if (data.roundStatus !== "active") {
    return (
      <Center>
        <div className="text-center">
          <h1 className="text-lg font-bold">{data.voteName} · {data.roundName}</h1>
          <p className="text-ink-500 mt-3">{{ pending: "本轮评分尚未开始", paused: "本轮评分已暂停", finished: "本轮评分已结束" }[data.roundStatus]}</p>
        </div>
      </Center>
    );
  }

  const scored = data.kind === "score" ? Object.values(scores).filter((v) => v > 0).length : picks.size;
  const total = data.contestants.length;

  return (
    <div className="min-h-screen bg-ink-50 max-w-3xl mx-auto pb-32">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10">
        <h1 className="font-bold leading-snug">{data.voteName} · {data.roundName}</h1>
        <p className="text-sm text-ink-500 mt-0.5">{data.groupName} · 评审：{data.voterName}</p>
      </div>

      <div className="p-4 space-y-3">
        {data.contestants.map((c) => (
          <div key={c.id} className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={contestantImg(c.image)} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium"><span className="num text-brand mr-1.5">{c.number}</span>{c.name}</p>
                {c.intro && <p className="text-xs text-ink-300 mt-0.5 truncate">{c.intro}</p>}
              </div>
            </div>
            {data.kind === "score" ? (
              <div className="flex items-center justify-center gap-6 mt-3">
                <button
                  className="w-14 h-14 rounded-full bg-ink-100 text-2xl font-bold active:bg-ink-200 select-none"
                  onClick={() => setScores((s) => ({ ...s, [c.id]: Math.max(0, (s[c.id] || 0) - 1) }))}
                >−</button>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-24 h-14 text-center text-3xl font-bold num border-b-2 border-brand outline-none"
                  value={scores[c.id] ?? 0}
                  onChange={(e) => {
                    const v = Math.min(data.maxScore, Math.max(0, Number(e.target.value.replace(/[^\d]/g, "") || 0)));
                    setScores((s) => ({ ...s, [c.id]: v }));
                  }}
                />
                <button
                  className="w-14 h-14 rounded-full bg-brand text-white text-2xl font-bold active:bg-brand-600 select-none"
                  onClick={() => setScores((s) => ({ ...s, [c.id]: Math.min(data.maxScore, (s[c.id] || 0) + 1) }))}
                >+</button>
              </div>
            ) : (
              <button
                className={`w-full h-12 mt-3 rounded-lg font-medium transition-all active:scale-95 ${picks.has(c.id) ? "bg-brand text-white" : "bg-ink-100 text-ink-700"}`}
                onClick={() => setPicks((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id);
                  else if (n.size < data.maxVotes) n.add(c.id);
                  return n;
                })}
              >
                {picks.has(c.id) ? "✓ 已选" : "选择"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-ink-100 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <span className="text-sm text-ink-500 num shrink-0">
            {data.kind === "score" ? `已评 ${scored}/${total}` : `已选 ${picks.size}/${data.maxVotes}`}
          </span>
          <button
            className="flex-1 h-14 rounded-xl bg-brand text-white text-lg font-bold active:bg-brand-600 disabled:bg-ink-200"
            disabled={scored === 0}
            onClick={() => {
              if (data.kind === "score" && scored < total) {
                if (!window.confirm(`还有 ${total - scored} 位选手未打分（按 0 分计），确认提交？`)) return;
              }
              setConfirm(true);
            }}
          >确认提交</button>
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(false)} />
          <div className="relative bg-white rounded-card p-6 w-full max-w-sm text-center">
            <h3 className="font-bold text-lg mb-2">确认提交评分？</h3>
            <p className="text-sm text-ink-500 mb-5">提交后不可修改。请再次确认各位选手的{data.kind === "score" ? "分数" : "选择"}。</p>
            <div className="flex gap-3">
              <button className="flex-1 h-12 rounded-lg border border-ink-200" onClick={() => setConfirm(false)}>再检查下</button>
              <button className="flex-1 h-12 rounded-lg bg-brand text-white font-bold disabled:bg-ink-200" disabled={submitting} onClick={submit}>
                {submitting ? "提交中…" : "确认提交"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6">{children}</div>;
}
function Spinner() {
  return <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" />;
}
