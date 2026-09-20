"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, getFp } from "@/lib/client";

interface VotePageData {
  voteId: string;
  voteName: string;
  cover: string | null;
  roundName: string;
  phase: string;
  countdownEndsAt: string | null;
  audienceShowResult: boolean;
  wxConfigured: boolean;
  identified: boolean;
  group: { id: string; maxVotes: number; allowRepeat: boolean; used: number; votedContestantIds: string[] } | null;
  contestants: { id: string; number: string; name: string; intro: string | null; image: string | null }[];
}

export default function AudienceVotePage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<VotePageData | null>(null);
  const [error, setError] = useState("");
  const [voting, setVoting] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setData(await api<VotePageData>(`/api/vote/${code}?fp=${getFp()}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function cast(contestantId: string) {
    if (voting) return;
    setVoting(contestantId);
    try {
      const res = await api<{ used: number; remaining: number }>(`/api/vote/${code}`, {
        method: "POST",
        body: JSON.stringify({ contestantId, fp: getFp() }),
      });
      setToast(`投票成功！剩余 ${res.remaining} 票`);
      if (navigator.vibrate) navigator.vibrate(50);
      await load();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setVoting(null);
      setTimeout(() => setToast(""), 2500);
    }
  }

  if (error) return <Center><p className="text-ink-500">{error}</p></Center>;
  if (!data) return <Center><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></Center>;

  const phaseText: Record<string, string> = { pending: "投票未开始", paused: "投票已暂停", finished: "投票已结束" };
  const active = data.phase === "active" && data.group;
  const countdown = data.countdownEndsAt ? Math.max(0, Math.floor((new Date(data.countdownEndsAt).getTime() - now) / 1000)) : null;
  const remaining = data.group ? data.group.maxVotes - data.group.used : 0;

  return (
    <div className="min-h-screen bg-ink-50 max-w-2xl mx-auto pb-24">
      {data.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.cover.startsWith("http") ? data.cover : `/api/media/${data.cover}`} alt="" className="w-full aspect-[16/7] object-cover" />
      )}
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10">
        <h1 className="font-bold leading-snug">{data.voteName}</h1>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-ink-500">{data.roundName}</p>
          {active && countdown !== null && countdown > 0 && (
            <span className="text-sm text-brand font-medium num">⏱ 剩余 {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
          )}
        </div>
        {active ? (
          <div className="mt-2 bg-brand-50 text-brand-700 text-sm rounded-lg px-3 py-2 num">
            我的剩余票数：{remaining} / {data.group!.maxVotes}
          </div>
        ) : (
          <div className="mt-2 bg-ink-100 text-ink-500 text-sm rounded-lg px-3 py-2">{phaseText[data.phase] ?? "投票未开放"}</div>
        )}
      </div>

      {data.wxConfigured && !data.identified && active && (
        <div className="mx-4 mt-3 bg-blue-50 text-blue-700 text-sm rounded-lg px-3 py-2.5 flex items-center justify-between">
          <span>为防刷票，需微信授权后投票</span>
          <button className="text-blue-600 font-medium" onClick={() => {
            location.href = `/api/wx/${data.voteId}/auth?next=${encodeURIComponent(`/vote/${code}`)}`;
          }}>去授权</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 p-4">
        {data.contestants.map((c) => {
          const voted = data.group?.votedContestantIds.includes(c.id);
          const disabled = !active || remaining <= 0 || (voted && !data.group?.allowRepeat) || voting === c.id;
          return (
            <div key={c.id} className="bg-white rounded-card shadow-card overflow-hidden">
              <div className="aspect-square bg-ink-100">
                {c.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image.startsWith("http") ? c.image : `/api/media/${c.image}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium leading-snug"><span className="num text-brand mr-1">{c.number}</span>{c.name}</p>
                {c.intro && <p className="text-xs text-ink-300 mt-0.5 line-clamp-1">{c.intro}</p>}
                <button
                  disabled={disabled}
                  onClick={() => cast(c.id)}
                  className={`w-full h-10 mt-2.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                    voted ? "bg-green-100 text-green-700" : disabled ? "bg-ink-100 text-ink-300" : "bg-brand text-white"
                  }`}
                >
                  {voted ? "✓ 已投" : voting === c.id ? "投票中…" : "投票"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {remaining === 0 && data.group && (
        <p className="text-center text-sm text-ink-500 pb-4">您已投完全部 {data.group.maxVotes} 票，感谢参与！</p>
      )}
      {data.audienceShowResult && (
        <p className="text-center pb-6">
          <a href={`/vote/${code}/result`} className="text-brand text-sm">查看当前结果 →</a>
        </p>
      )}

      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-ink-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lift z-50 animate-bounce">
          {toast}
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6">{children}</div>;
}
