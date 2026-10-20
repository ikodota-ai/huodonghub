"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Skeleton, Empty } from "@/components/ui";
import { VoteDetail } from "./types";

interface RoundResults {
  voteName: string; roundName: string; status: string;
  batchMode: boolean;
  groups: { id: string; name: string; kind: string; weight: number }[];
  results: {
    rank: number; number: string; name: string; total: number;
    batch: number;
    groups: { groupId: string; name: string; kind: string; weight: number; raw: number; contribution: number; participants: number; rate: number | null; voteMode: string | null; fixedPoints: number | null }[];
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

// 选手跨轮成绩单：每一轮各群体具体分数（原始值+折算），评分群体含逐评委明细
export interface ContestantDetail {
  contestant: { id: string; number: string; name: string; image: string | null };
  rounds: {
    roundId: string; roundName: string; participated: boolean; batch: number; total: number | null;
    groups: {
      name: string; kind: string; weight: number; raw: number; contribution: number; participants: number;
      fixedPoints: number | null; rate: number | null; voteMode: string | null;
      judges: { name: string; score: number; share: number }[];
    }[];
  }[];
}

export function ResultsTab({ vote }: { vote: VoteDetail }) {
  const [mode, setMode] = useState<"round" | "aggregate">("round");
  const [roundId, setRoundId] = useState<string | null>(vote.rounds[0]?.id ?? null);
  const [roundData, setRoundData] = useState<RoundResults | null>(null);
  const [aggData, setAggData] = useState<Aggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRounds, setSelectedRounds] = useState<string[]>(vote.rounds.map((r) => r.id));
  // 轮次明细展开：选手成绩单（含逐评委打分）
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContestantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [judgeOpen, setJudgeOpen] = useState<Set<string>>(new Set());

  async function toggleExpand(contestantId: string) {
    if (expanded === contestantId) { setExpanded(null); return; }
    setExpanded(contestantId);
    setDetail(null);
    setJudgeOpen(new Set());
    setDetailLoading(true);
    try {
      const q = selectedRounds.length > 0 ? `?rounds=${selectedRounds.join(",")}` : "";
      setDetail(await api<ContestantDetail>(`/api/results/vote/${vote.id}/contestant/${contestantId}${q}`));
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleJudges(key: string) {
    setJudgeOpen((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  // 切换聚合轮次/模式时收起明细，避免与勾选口径不一致
  useEffect(() => { setExpanded(null); setDetail(null); }, [selectedRounds, mode]);

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
            <span className="text-xs text-ink-300">同名群体跨轮合并：评分取平均，投票票数累加、占比取平均；点选手行「轮次明细」看每轮具体分数与逐评委打分</span>
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
                    <td className="px-3 py-3"><span className="num text-ink-300 mr-2">{r.number}</span>{r.name}{roundData.batchMode && <span className="ml-1.5 text-xs text-ink-300">第{r.batch}批</span>}</td>
                    {r.groups.map((d) => (
                      <td key={d.groupId} className="px-3 py-3 text-right">
                        <span className="num font-medium">{d.contribution}</span>
                        <span className="block text-xs text-ink-300 num">
                          {d.kind === "vote"
                            ? (d.fixedPoints != null ? `${d.raw}票 × ${d.fixedPoints}分` : d.voteMode === "participants" ? `${d.raw}票/${d.participants}人` : `${d.raw}票 · ${d.rate}%`)
                            : `均分 ${d.raw}`}
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
                  <div key={item.contestantId}>
                  <div className="flex items-start gap-4 px-5 py-4">
                    <span className={`mt-1 inline-flex w-8 h-8 rounded-full items-center justify-center font-bold shrink-0 ${item.rank === 1 ? "bg-brand text-white" : item.rank <= 3 ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500"}`}>{item.rank}</span>
                    <div className="w-52 shrink-0">
                      <div className="font-medium leading-snug"><span className="num text-ink-300 mr-1.5">{item.number}</span>{item.name}</div>
                      <div className="text-xs text-ink-300 mt-0.5">总分</div>
                      <div className="text-xl font-bold num text-brand-700 leading-tight">{item.total}</div>
                      <button className="text-xs text-brand mt-1 hover:underline" onClick={() => toggleExpand(item.contestantId)}>
                        {expanded === item.contestantId ? "收起 ▴" : "轮次明细 ▾"}
                      </button>
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
                  {expanded === item.contestantId && (
                    <div className="px-5 pb-5">
                      {detailLoading && <p className="text-sm text-ink-300 py-3 text-center">成绩单加载中…</p>}
                      {!detailLoading && detail && (
                        <div className="bg-ink-50 rounded-xl p-4 overflow-x-auto">
                          <p className="text-xs text-ink-500 mb-3">
                            {detail.contestant.number} {detail.contestant.name} · 各轮成绩单（评分群体点「均分」行可看逐评委打分与折算）
                          </p>
                          <table className="w-full text-sm min-w-[560px]">
                            <thead>
                              <tr className="text-left text-ink-300 text-xs border-b border-ink-100">
                                <th className="py-2 pr-3 font-medium">轮次</th>
                                {(() => {
                                  const cols: string[] = [];
                                  for (const r of detail.rounds) for (const g of r.groups) if (!cols.includes(g.name)) cols.push(g.name);
                                  return cols.map((c) => <th key={c} className="py-2 px-2 font-medium text-right">{c}</th>);
                                })()}
                                <th className="py-2 pl-2 font-medium text-right">轮总分</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                              {detail.rounds.map((round) => {
                                const cols: string[] = [];
                                for (const r of detail.rounds) for (const g of r.groups) if (!cols.includes(g.name)) cols.push(g.name);
                                if (!round.participated) {
                                  return (
                                    <tr key={round.roundId}>
                                      <td className="py-2.5 pr-3 text-ink-500">{round.roundName}</td>
                                      <td colSpan={cols.length + 1} className="py-2.5 text-center text-ink-300 text-xs">未参赛</td>
                                    </tr>
                                  );
                                }
                                return (
                                  <tr key={round.roundId} className="align-top">
                                    <td className="py-2.5 pr-3 whitespace-nowrap">
                                      {round.roundName}
                                      {round.batch > 0 && <span className="ml-1 text-xs text-ink-300">第{round.batch}批</span>}
                                    </td>
                                    {cols.map((name) => {
                                      const g = round.groups.find((x) => x.name === name);
                                      if (!g) return <td key={name} className="py-2.5 px-2 text-right text-ink-300">—</td>;
                                      const jKey = `${round.roundId}|${name}`;
                                      const open = judgeOpen.has(jKey);
                                      return (
                                        <td key={name} className="py-2.5 px-2 text-right">
                                          <span className="num font-medium">{g.contribution}</span>
                                          {g.kind === "score" && g.judges.length > 0 ? (
                                            <button className="block ml-auto text-xs text-brand num hover:underline" onClick={() => toggleJudges(jKey)}>
                                              均分 {g.raw} · {g.participants}人 {open ? "▴" : "▾"}
                                            </button>
                                          ) : (
                                            <span className="block text-xs text-ink-300 num">
                                              {g.kind === "vote"
                                                ? (g.fixedPoints != null ? `${g.raw}票 × ${g.fixedPoints}分` : g.voteMode === "participants" ? `${g.raw}票/${g.participants}人` : `${g.raw}票 · ${g.rate}%`)
                                                : `均分 ${g.raw} · ${g.participants}人`}
                                            </span>
                                          )}
                                          {open && g.judges.length > 0 && (
                                            <div className="mt-1.5 bg-white rounded-lg border border-ink-100 divide-y divide-ink-50 text-left">
                                              {g.judges.map((j, ji) => (
                                                <div key={ji} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs">
                                                  <span className="text-ink-700">{j.name}</span>
                                                  <span className="num whitespace-nowrap">{j.score} 分 <span className="text-ink-300">折算 {j.share}</span></span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="py-2.5 pl-2 text-right num font-bold text-brand-700">{round.total}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
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
