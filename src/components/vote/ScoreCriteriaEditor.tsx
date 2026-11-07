"use client";

import { useMemo, useState } from "react";
import { Button, Input } from "@/components/ui";
import { computeScoreTotal, validateCriteria, type CriterionConfig, type ScoreMode } from "@/lib/score-criteria";

interface ScoreCriteriaPatch {
  mode?: ScoreMode;
  maxScore?: number;
  criteria?: CriterionConfig[];
}

interface ScoreCriteriaEditorProps {
  mode: ScoreMode;
  maxScore: number;
  criteria: CriterionConfig[];
  disabled?: boolean;
  onChange: (patch: ScoreCriteriaPatch) => void;
}

let draftCriterionSequence = 0;

function createCriterion(mode: Exclude<ScoreMode, "single">, sort: number): CriterionConfig {
  draftCriterionSequence += 1;
  return {
    id: `draft-${Date.now().toString(36)}-${draftCriterionSequence}`,
    name: "",
    maxScore: mode === "weighted" ? 100 : 0,
    weight: mode === "weighted" ? 0 : null,
    sort,
  };
}

function initialCriteria(mode: Exclude<ScoreMode, "single">): CriterionConfig[] {
  return [
    { ...createCriterion(mode, 1), name: "第一项", maxScore: mode === "weighted" ? 100 : 50, weight: mode === "weighted" ? 50 : null },
    { ...createCriterion(mode, 2), name: "第二项", maxScore: mode === "weighted" ? 100 : 50, weight: mode === "weighted" ? 50 : null },
  ];
}

function normalizeSort(criteria: CriterionConfig[]) {
  return criteria.map((criterion, index) => ({ ...criterion, sort: index + 1 }));
}

export function ScoreCriteriaEditor({ mode, maxScore, criteria, disabled = false, lockReason = "scores", onChange }: ScoreCriteriaEditorProps & { lockReason?: "scores" | "started" }) {
  const [trialScores, setTrialScores] = useState<Record<string, string>>({});
  const detailed = mode !== "single";
  const validationError = detailed ? validateCriteria(mode, maxScore, criteria) : null;

  const previewTotal = useMemo(() => {
    if (!detailed || validationError) return null;
    if (criteria.some((criterion) => !trialScores[criterion.id])) return null;
    try {
      return computeScoreTotal(mode, criteria, criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: Number(trialScores[criterion.id]),
      })));
    } catch {
      return null;
    }
  }, [criteria, detailed, mode, trialScores, validationError]);

  function changeMode(nextMode: ScoreMode) {
    if (nextMode === "single") {
      onChange({ mode: nextMode });
      return;
    }
    const nextCriteria = criteria.length >= 2
      ? criteria.map((criterion) => ({
          ...criterion,
          maxScore: nextMode === "weighted" ? 100 : criterion.maxScore,
          weight: nextMode === "weighted" ? criterion.weight ?? 0 : null,
        }))
      : initialCriteria(nextMode);
    onChange({ mode: nextMode, maxScore: 100, criteria: normalizeSort(nextCriteria) });
  }

  function patchCriterion(id: string, patch: Partial<CriterionConfig>) {
    onChange({ criteria: criteria.map((criterion) => criterion.id === id ? { ...criterion, ...patch } : criterion) });
  }

  function moveCriterion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= criteria.length) return;
    const nextCriteria = [...criteria];
    [nextCriteria[index], nextCriteria[target]] = [nextCriteria[target], nextCriteria[index]];
    onChange({ criteria: normalizeSort(nextCriteria) });
  }

  return (
    <div className="mt-4 rounded-xl border border-brand-100 bg-white/80 p-4" data-testid="score-criteria-editor">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink-700">评分方式</span>
        <div className="inline-flex rounded-lg bg-ink-100 p-1" aria-label="评分方式">
          <button type="button" disabled={disabled} aria-pressed={mode === "single"} onClick={() => changeMode("single")}
            className={`h-8 rounded-md px-4 text-sm transition ${mode === "single" ? "bg-white font-medium text-brand shadow-sm" : "text-ink-500 hover:text-ink-700"}`}>整体评分</button>
          <button type="button" disabled={disabled} aria-pressed={detailed} onClick={() => { if (!detailed) changeMode("weighted"); }}
            className={`h-8 rounded-md px-4 text-sm transition ${detailed ? "bg-white font-medium text-brand shadow-sm" : "text-ink-500 hover:text-ink-700"}`}>细分评分</button>
        </div>
        {disabled && <span className="text-xs text-brand-700">{lockReason === "started" ? "轮次已锁定" : "规则已锁定"}</span>}
      </div>

      {disabled && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{lockReason === "started" ? "轮次已开始，评分规则已锁定；暂停后也不能修改。如需新规则，请新建轮次。" : "已有评分数据，清空该群体成绩后才能修改评分方式、评分项、满分或比例。"}</p>}
      {!detailed ? (
        <p className="mt-3 text-xs text-ink-400">每位评委直接填写一个总分，沿用现有评分与均分规则。</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[240px_1fr] md:items-center">
            <label className="text-sm text-ink-600">
              <span className="mb-1.5 block font-medium">计分模式</span>
              <select aria-label="计分模式" disabled={disabled} value={mode} onChange={(event) => changeMode(event.target.value as ScoreMode)}
                className="h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm outline-none focus:border-brand">
                <option value="sum">分值分配</option>
                <option value="weighted">百分制加权</option>
              </select>
            </label>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs leading-5 text-ink-500">
              {mode === "sum" ? "各项满分合计 100，评委各项得分直接相加。例如 47 + 46 = 93。" : "各项均按 100 分评价，再按比例合成 100 分。例如 97、99 各占 50%，合成 98 分。"}
            </p>
          </div>

          <div>
            <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_110px_110px_88px] gap-2 px-1 text-xs text-ink-400 md:grid">
              <span>评分项</span><span>满分</span><span>{mode === "weighted" ? "比例" : "得分规则"}</span><span>操作</span>
            </div>
            <div className="space-y-2">
              {criteria.map((criterion, index) => (
                <div key={criterion.id} className="grid grid-cols-2 gap-2 rounded-lg border border-ink-100 p-2 md:grid-cols-[minmax(0,1fr)_110px_110px_88px] md:items-center md:border-0 md:p-0">
                  <div className="col-span-2 flex items-center gap-2 md:col-span-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand">{index + 1}</span>
                    <Input aria-label={`评分项 ${index + 1} 名称`} disabled={disabled} value={criterion.name} maxLength={64}
                      placeholder={`如：${index === 0 ? "第一道菜" : "第二道菜"}`}
                      onChange={(event) => patchCriterion(criterion.id, { name: event.target.value })} />
                  </div>
                  <label className="flex items-center gap-1 text-xs text-ink-400">
                    <Input aria-label={`${criterion.name || `评分项 ${index + 1}`}满分`} type="number" min={1} max={100}
                      disabled={disabled || mode === "weighted"} value={criterion.maxScore}
                      onChange={(event) => patchCriterion(criterion.id, { maxScore: Number(event.target.value) })} /> 分
                  </label>
                  {mode === "weighted" ? (
                    <label className="flex items-center gap-1 text-xs text-ink-400">
                      <Input aria-label={`${criterion.name || `评分项 ${index + 1}`}比例`} type="number" min={0} max={100} step={0.01}
                        disabled={disabled} value={criterion.weight ?? 0}
                        onChange={(event) => patchCriterion(criterion.id, { weight: Number(event.target.value) })} /> %
                    </label>
                  ) : <span className="flex items-center text-xs text-ink-400">直接计入总分</span>}
                  <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
                    <button type="button" aria-label={`上移评分项 ${index + 1}`} disabled={disabled || index === 0} onClick={() => moveCriterion(index, -1)} className="h-8 w-7 rounded text-ink-400 hover:bg-ink-50 hover:text-brand disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`下移评分项 ${index + 1}`} disabled={disabled || index === criteria.length - 1} onClick={() => moveCriterion(index, 1)} className="h-8 w-7 rounded text-ink-400 hover:bg-ink-50 hover:text-brand disabled:opacity-30">↓</button>
                    <button type="button" aria-label={`删除评分项 ${index + 1}`} disabled={disabled || criteria.length <= 2}
                      onClick={() => onChange({ criteria: normalizeSort(criteria.filter((item) => item.id !== criterion.id)) })}
                      className="h-8 w-7 rounded text-ink-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30">×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" size="sm" disabled={disabled || criteria.length >= 10}
                onClick={() => onChange({ criteria: normalizeSort([...criteria, createCriterion(mode, criteria.length + 1)]) })}>＋ 添加评分项</Button>
              <span className="text-xs text-ink-400">2～10 项，{mode === "sum" ? "各项满分" : "比例"}合计须为 100{mode === "weighted" ? "%" : " 分"}</span>
            </div>
          </div>

          <div data-testid="criteria-validation" className={`rounded-lg px-3 py-2 text-sm ${validationError ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
            {validationError ?? `规则校验通过：${mode === "sum" ? "满分合计 100 分" : "比例合计 100%"}，合成总分为 100 分制。`}
          </div>

          <div className="rounded-xl bg-ink-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink-700">试算验收</span>
              <span className="text-xs text-ink-400">仅验证规则，不保存到选手成绩</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {criteria.map((criterion, index) => (
                <label key={criterion.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-ink-500">
                  <span className="min-w-0 flex-1 truncate">{criterion.name || `评分项 ${index + 1}`}</span>
                  <Input aria-label={`${criterion.name || `评分项 ${index + 1}`}试算`} type="number" min={0} max={criterion.maxScore}
                    value={trialScores[criterion.id] ?? ""}
                    onChange={(event) => setTrialScores((current) => ({ ...current, [criterion.id]: event.target.value }))}
                    className="!h-8 !w-20 shrink-0" />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-4 py-3">
              <span className="text-sm text-ink-500">合成总分</span>
              <span className="num text-xl font-semibold text-brand"><span data-testid="criteria-preview-total">{previewTotal === null ? "—" : previewTotal.toFixed(2)}</span><span className="ml-1 text-xs font-normal text-ink-300">/ 100</span></span>
            </div>
          </div>
          <p className="text-xs leading-5 text-ink-400">最终折算：每位评委先合成总分，再计算多人平均分，最后乘本群体权重；不会重复乘以评分项比例。</p>
        </div>
      )}
    </div>
  );
}
