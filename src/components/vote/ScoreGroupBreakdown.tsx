import type { ScoreMode } from "@/lib/score-criteria";
import type { ScoreItemDetail } from "@/lib/score-item-details";

export interface ScoreGroupBreakdownData {
  scoreMode: ScoreMode;
  criteria: {
    id: string;
    name: string;
    maxScore: number;
    weight: number | null;
    sort: number;
    averageScore: number | null;
    averageContribution: number | null;
  }[];
  judges: { name: string; score: number; share: number; items: ScoreItemDetail[] }[];
}

export function ScoreGroupBreakdown({ group, className = "" }: { group: ScoreGroupBreakdownData; className?: string }) {
  const detailed = group.scoreMode !== "single";
  return (
    <div className={`rounded-lg border border-ink-100 bg-white text-left ${className}`}>
      {detailed && group.criteria.length > 0 && (
        <div className="border-b border-ink-100 p-3">
          <p className="mb-2 text-xs font-medium text-ink-500">评分项汇总</p>
          <div className="space-y-1.5">
            {group.criteria.map((criterion) => (
              <div key={criterion.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
                <span className="text-ink-600">{criterion.name}<span className="ml-1 text-ink-300">{criterion.weight != null ? `${criterion.weight}%` : `满分${criterion.maxScore}`}</span></span>
                <span className="num whitespace-nowrap text-ink-500">平均 {criterion.averageScore ?? "—"}<span className="ml-1 text-ink-300">贡献 {criterion.averageContribution ?? "—"}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="divide-y divide-ink-100">
        {group.judges.map((judge, judgeIndex) => (
          <div key={`${judge.name}-${judgeIndex}`} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-ink-700">{judge.name}</span>
              <span className="num whitespace-nowrap">合成 {judge.score} 分 <span className="text-ink-300">个人折算 {judge.share}</span></span>
            </div>
            {detailed && judge.items.length > 0 && (
              <div className="mt-2 space-y-1 rounded-lg bg-ink-50 p-2">
                {judge.items.map((item) => (
                  <div key={item.criterionId} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink-500">{item.name}<span className="ml-1 text-ink-300">{item.weight != null ? `${item.weight}%` : ""}</span></span>
                    <span className="num whitespace-nowrap text-ink-600">{item.score ?? "—"}<span className="mx-1 text-ink-300">→</span>{item.contribution ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
