"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Skeleton, Empty } from "@/components/ui";
import { VoteDetail } from "./types";

interface RoundResults {
  voteName: string; roundName: string; status: string;
  groups: { id: string; name: string; kind: string; weight: number }[];
  results: {
    rank: number; number: string; name: string; total: number;
    groups: { groupId: string; name: string; kind: string; weight: number; raw: number; contribution: number; participants: number }[];
  }[];
}

interface Aggregate {
  voteName: string; roundCount: number; contestantCount: number; maxTotal: number; avgTotal: number;
  rounds: { id: string; name: string }[];
  list: {
    rank: number; contestantId: string; number: string; name: string; total: number;
    groups: { key: string; name: string; kind: string; weight: number; scoreAvg: number; votes: number; votePct: number; fixedPoints: number | null; contribution: number }[];
  }[];
}

export function ResultsTab({ vote }: { vote: VoteDetail }) {
  const [mode, setMode] = useState<"round" | "aggregate">("round");
  const [roundId, setRoundId] = useState<string | null>(vote.rounds[0]?.id ?? null);
  const [roundData, setRoundData] = useState<RoundResults | null>(null);
  const [aggData, setAggData] = useState<Aggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRounds, setSelectedRounds] = useState<string[]>(vote.rounds.map((r) => r.id));

  useEffect(() => {
    if (mode === "round" && roundId) {
      setLoading(true);
      api<RoundResults>(`/api/results/round/${roundId}`).then(setRoundData).finally(() => setLoading(false));
    }
  }, [mode, roundId]);

  useEffect(() => {
    if (mode === "aggregate") {
      setLoading(true);
      const q = selectedRounds.length > 0 ? `?rounds=${selectedRounds.join(",")}` : "";
      api<Aggregate>(`/api/results/vote/${vote.id}/aggregate${q}`).then(setAggData).finally(() => setLoading(false));
    }
  }, [mode, vote.id, selectedRounds]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant={mode === "round" ? "primary" : "secondary"} size="sm" onClick={() => setMode("round")}>单轮结果</Button>
          <Button variant={mode === "aggregate" ? "primary" : "secondary"} size="sm" onClick={() => setMode("aggregate")}>跨轮聚合</Button>
        </div>
        {mode === "round" && roundId && (
          <div className="flex gap-2 items-center">
            <select className="h-9 px-3 rounded-lg border border-ink-200 text-sm bg-white" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
              {vote.rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Button variant="secondary" size="sm" onClick={() => window.open(`/api/results/round/${roundId}/csv`)}>导出 CSV</Button>
          </div>
        )}
        {mode === "aggregate" && (
          <Button variant="secondary" size="sm" onClick={() => window.open(`/api/results/vote/${vote.id}/aggregate/csv${selectedRounds.length > 0 ? `?rounds=${selectedRounds.join(",")}` : ""}`)}>导出聚合结果</Button>
        )}
      </div>

      {mode === "aggregate" && (
        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-ink-500">聚合轮次：</span>
            {vote.rounds.map((r) => (
              <label key={r.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={selectedRounds.includes(r.id)}
                  onChange={(e) => setSelectedRounds((prev) => e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id))}
                />
                {r.name}
              </label>
            ))}
            <span className="text-xs text-ink-300">同名群体跨轮合并：评分取平均，投票票数累加、占比取平均</span>
          </div>
        </Card>
      )}

      {loading && <Skeleton rows={5} />}

      {!loading && mode === "round" && roundData && (
        <Card>
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <h3 className="font-semibold">{roundData.voteName} · {roundData.roundName}</h3>
            <span className="text-xs text-ink-300">{roundData.groups.map((g) => `${g.name} ${g.weight}%`).join(" · ")}</span>
          </div>
          {roundData.results.length === 0 ? <Empty text="本轮暂无参赛名单或票数据" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-300 border-b border-ink-100">
                  <th className="px-5 py-3 font-medium w-14">排名</th>
                  <th className="px-3 py-3 font-medium">选手</th>
                  {roundData.groups.map((g) => <th key={g.id} className="px-3 py-3 font-medium text-right">{g.name}<span className="block text-xs font-normal">{g.weight}%</span></th>)}
                  <th className="px-5 py-3 font-medium text-right">总分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {roundData.results.map((r) => (
                  <tr key={r.number + r.name} className={r.rank <= 3 ? "bg-brand-50/40" : ""}>
                    <td className="px-5 py-3">
                      <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ${r.rank === 1 ? "bg-brand text-white" : r.rank <= 3 ? "bg-brand-100 text-brand-700" : "text-ink-500"}`}>{r.rank}</span>
                    </td>
                    <td className="px-3 py-3"><span className="num text-ink-300 mr-2">{r.number}</span>{r.name}</td>
                    {r.groups.map((d) => (
                      <td key={d.groupId} className="px-3 py-3 text-right">
                        <span className="num font-medium">{d.contribution}</span>
                        <span className="block text-xs text-ink-300 num">
                          {d.kind === "vote" ? `${d.raw}票/${d.participants}人` : `均分 ${d.raw}`}
                        </span>
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right num font-bold text-brand-700">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && mode === "aggregate" && aggData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "参与选项", value: aggData.contestantCount },
              { label: "聚合项目", value: aggData.roundCount },
              { label: "最高总分", value: aggData.maxTotal },
              { label: "平均总分", value: aggData.avgTotal },
            ].map((s) => (
              <Card key={s.label} className="p-4 text-center">
                <div className="text-2xl font-bold num text-brand-700">{s.value}</div>
                <div className="text-xs text-ink-300 mt-1">{s.label}</div>
              </Card>
            ))}
          </div>
          <Card>
            <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
              <h3 className="font-semibold">聚合排名结果</h3>
              <span className="text-xs text-ink-300">{aggData.rounds.map((r) => r.name).join("、")}</span>
            </div>
            {aggData.list.length === 0 ? <Empty text="暂无数据" /> : (
              <div className="divide-y divide-ink-100">
                {aggData.list.map((item) => (
                  <div key={item.contestantId} className="flex items-start gap-4 px-5 py-4">
                    <span className={`mt-1 inline-flex w-8 h-8 rounded-full items-center justify-center font-bold shrink-0 ${item.rank === 1 ? "bg-brand text-white" : item.rank <= 3 ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500"}`}>{item.rank}</span>
                    <div className="w-52 shrink-0">
                      <div className="font-medium leading-snug"><span className="num text-ink-300 mr-1.5">{item.number}</span>{item.name}</div>
                      <div className="text-xs text-ink-300 mt-0.5">总分</div>
                      <div className="text-xl font-bold num text-brand-700 leading-tight">{item.total}</div>
                    </div>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {item.groups.map((g) => (
                        <div key={g.key} className="bg-ink-50 rounded-lg px-3 py-2.5 text-center">
                          <div className="text-xs text-ink-500">{g.name}</div>
                          <div className="num font-semibold text-ink-900 mt-0.5">
                            {g.kind === "score" ? `${g.scoreAvg}分` : g.fixedPoints != null ? `${g.votes}票 × ${g.fixedPoints}分` : `${g.votes}票（${g.votePct}%）`}
                          </div>
                          <div className="text-xs text-ink-300 num mt-0.5">权重 {g.weight}%{g.fixedPoints == null && <> · 得分 {g.contribution}</>}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
