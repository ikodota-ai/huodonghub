"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, contestantImg, getFp } from "@/lib/client";
import { Modal } from "@/components/ui";
import { useDialogs } from "@/components/ui/dialogs";
import {
  computeCriteriaContributions,
  computeScoreTotal,
  type CriterionConfig,
  type ScoreMode,
} from "@/lib/score-criteria";

interface JudgeContestant {
  id: string;
  number: string;
  name: string;
  intro: string | null;
  image: string | null;
}

export interface JudgeCriteriaData {
  roundId: string;
  groupId: string;
  voteName: string;
  roundName: string;
  groupName: string;
  voterName: string;
  scoreMode: ScoreMode;
  criteria: CriterionConfig[];
  currentBatch: number;
  batches: number[];
  contestants: JudgeContestant[];
}

type ItemValues = Record<string, string>;
type ContestantValues = Record<string, ItemValues>;
type ViewMode = "single" | "list";

function normalizeScore(value: string, maxScore: number) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return String(Math.min(maxScore, Math.max(0, Number(normalized))));
}

export function JudgeCriteriaForm({ data, token, onSubmitted }: {
  data: JudgeCriteriaData;
  token: string;
  onSubmitted: (batch: number) => Promise<void>;
}) {
  const { toast, dialogNode } = useDialogs();
  const [values, setValues] = useState<ContestantValues>({});
  const [activeId, setActiveId] = useState(data.contestants[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [viewReady, setViewReady] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [validationMsg, setValidationMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [highlightId, setHighlightId] = useState("");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const ruleSignature = useMemo(() => JSON.stringify({
    mode: data.scoreMode,
    criteria: data.criteria.map((criterion) => [criterion.id, criterion.name, criterion.maxScore, criterion.weight, criterion.sort]),
  }), [data.criteria, data.scoreMode]);
  const draftKey = `judge-criteria-draft:${token}:${data.roundId}:${data.groupId}:${data.currentBatch}:${ruleSignature}`;
  const draftPointerKey = `judge-criteria-draft-pointer:${token}:${data.roundId}:${data.groupId}:${data.currentBatch}`;
  const viewKey = `judge-criteria-view:${token}`;

  useEffect(() => {
    const stored = localStorage.getItem(viewKey);
    if (stored === "list" || stored === "single") setViewMode(stored);
    setViewReady(true);
  }, [viewKey]);

  useEffect(() => {
    if (viewReady) localStorage.setItem(viewKey, viewMode);
  }, [viewKey, viewMode, viewReady]);

  useEffect(() => {
    try {
      const previousKey = localStorage.getItem(draftPointerKey);
      if (previousKey && previousKey !== draftKey) {
        localStorage.removeItem(previousKey);
        setNotice("评分规则已变化，旧暂存未恢复，请按最新规则重新评分。");
      }
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        setValues(JSON.parse(raw) as ContestantValues);
        setNotice("已恢复本机暂存，提交前请再核对分数。 ");
      }
      localStorage.setItem(draftPointerKey, draftKey);
    } catch {
      localStorage.removeItem(draftKey);
      setNotice("本机暂存无法读取，已改为空白评分表。 ");
    } finally {
      setDraftReady(true);
    }
  }, [draftKey, draftPointerKey]);

  useEffect(() => {
    if (!draftReady) return;
    if (Object.keys(values).length === 0) {
      localStorage.removeItem(draftKey);
      return;
    }
    localStorage.setItem(draftKey, JSON.stringify(values));
    localStorage.setItem(draftPointerKey, draftKey);
  }, [draftKey, draftPointerKey, draftReady, values]);

  function filledCount(contestantId: string) {
    const contestantValues = values[contestantId] ?? {};
    return data.criteria.filter((criterion) => contestantValues[criterion.id] !== undefined && contestantValues[criterion.id] !== "").length;
  }

  function statusOf(contestantId: string): "empty" | "partial" | "complete" {
    const filled = filledCount(contestantId);
    if (filled === 0) return "empty";
    return filled === data.criteria.length ? "complete" : "partial";
  }

  function updateValue(contestantId: string, criterionId: string, value: string, maxScore: number) {
    setValidationMsg("");
    setValues((current) => ({
      ...current,
      [contestantId]: { ...(current[contestantId] ?? {}), [criterionId]: normalizeScore(value, maxScore) },
    }));
  }

  function totalFor(contestantId: string) {
    if (statusOf(contestantId) !== "complete") return null;
    const contestantValues = values[contestantId];
    return computeScoreTotal(data.scoreMode, data.criteria, data.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: Number(contestantValues[criterion.id]),
    })));
  }

  function focusContestant(contestantId: string) {
    setActiveId(contestantId);
    setHighlightId(contestantId);
    if (viewMode === "list") {
      requestAnimationFrame(() => cardRefs.current[contestantId]?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
    window.setTimeout(() => setHighlightId(""), 1800);
  }

  const completed = data.contestants.filter((contestant) => statusOf(contestant.id) === "complete").length;
  const partial = data.contestants.filter((contestant) => statusOf(contestant.id) === "partial").length;
  const empty = data.contestants.length - completed - partial;
  const activeContestant = data.contestants.find((contestant) => contestant.id === activeId) ?? data.contestants[0];

  function openConfirmation() {
    const firstPartial = data.contestants.find((contestant) => statusOf(contestant.id) === "partial");
    if (firstPartial) {
      setValidationMsg(`「${firstPartial.name}」的评分项尚未填写完整，请补齐后再提交。`);
      focusContestant(firstPartial.id);
      return;
    }
    if (completed === 0) {
      setValidationMsg("请至少完整填写一位选手的评分项。");
      toast("请至少完整填写一位选手的评分项");
      return;
    }
    setValidationMsg("");
    setConfirmOpen(true);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const scores = data.contestants.map((contestant) => {
        const complete = statusOf(contestant.id) === "complete";
        return {
          contestantId: contestant.id,
          items: data.criteria.map((criterion) => ({
            criterionId: criterion.id,
            score: complete ? Number(values[contestant.id][criterion.id]) : 0,
          })),
        };
      });
      await api(`/api/judge/${token}`, { method: "POST", body: JSON.stringify({ scores, fp: getFp() }) });
      localStorage.removeItem(draftKey);
      localStorage.removeItem(draftPointerKey);
      setConfirmOpen(false);
      await onSubmitted(data.currentBatch);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-ink-50 pb-36">
      <div className="sticky top-0 z-20 border-b border-ink-100 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-bold leading-snug">{data.voteName} · {data.roundName}</h1>
            <p className="mt-1 text-sm text-ink-500">{data.groupName} · 评审：{data.voterName}
              {data.batches.length > 1 && data.currentBatch > 0 && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">第 {data.currentBatch} 批 / 共 {data.batches.length} 批</span>}
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-ink-100 p-1" aria-label="评分视图">
            <button type="button" aria-pressed={viewMode === "single"} onClick={() => setViewMode("single")}
              className={`h-9 rounded-lg px-4 text-sm font-medium ${viewMode === "single" ? "bg-white text-brand shadow-sm" : "text-ink-500"}`}>逐人填写</button>
            <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}
              className={`h-9 rounded-lg px-4 text-sm font-medium ${viewMode === "list" ? "bg-white text-brand shadow-sm" : "text-ink-500"}`}>多人同页</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
          <span>已完成 <strong className="num text-green-600">{completed}</strong></span>
          <span>未完整 <strong className="num text-orange-600">{partial}</strong></span>
          <span>未评分 <strong className="num">{empty}</strong></span>
          <span className="text-ink-300">填了一半的选手须补齐；完全未评分可在提交时确认按 0 分计</span>
        </div>
        {notice && <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{notice}</p>}
        {validationMsg && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{validationMsg}</p>}
      </div>

      {viewMode === "single" && activeContestant ? (
        <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:h-fit lg:flex-col lg:overflow-visible lg:rounded-card lg:bg-white lg:p-3 lg:shadow-card">
            {data.contestants.map((contestant) => {
              const status = statusOf(contestant.id);
              return (
                <button key={contestant.id} type="button" onClick={() => setActiveId(contestant.id)}
                  className={`flex min-w-[150px] items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition lg:min-w-0 ${contestant.id === activeContestant.id ? "border-brand bg-brand-50 text-brand" : "border-ink-100 bg-white text-ink-600"}`}>
                  <span className="num font-semibold">{contestant.number}</span>
                  <span className="min-w-0 flex-1 truncate">{contestant.name}</span>
                  <span className={`h-2 w-2 rounded-full ${status === "complete" ? "bg-green-500" : status === "partial" ? "bg-orange-500" : "bg-ink-200"}`} />
                </button>
              );
            })}
          </div>
          <div>
            <ContestantScoreCard contestant={activeContestant} criteria={data.criteria} mode={data.scoreMode}
              values={values[activeContestant.id] ?? {}} status={statusOf(activeContestant.id)} total={totalFor(activeContestant.id)}
              highlighted={highlightId === activeContestant.id}
              onChange={(criterionId, value, maxScore) => updateValue(activeContestant.id, criterionId, value, maxScore)} />
            <div className="mt-3 flex justify-between">
              <button type="button" className="h-10 rounded-lg border border-ink-200 bg-white px-4 text-sm disabled:opacity-40"
                disabled={data.contestants.findIndex((contestant) => contestant.id === activeContestant.id) <= 0}
                onClick={() => {
                  const index = data.contestants.findIndex((contestant) => contestant.id === activeContestant.id);
                  setActiveId(data.contestants[index - 1].id);
                }}>← 上一位</button>
              <button type="button" className="h-10 rounded-lg border border-ink-200 bg-white px-4 text-sm disabled:opacity-40"
                disabled={data.contestants.findIndex((contestant) => contestant.id === activeContestant.id) === data.contestants.length - 1}
                onClick={() => {
                  const index = data.contestants.findIndex((contestant) => contestant.id === activeContestant.id);
                  setActiveId(data.contestants[index + 1].id);
                }}>下一位 →</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {data.contestants.map((contestant) => (
            <div key={contestant.id} ref={(node) => { cardRefs.current[contestant.id] = node; }}>
              <ContestantScoreCard contestant={contestant} criteria={data.criteria} mode={data.scoreMode}
                values={values[contestant.id] ?? {}} status={statusOf(contestant.id)} total={totalFor(contestant.id)}
                highlighted={highlightId === contestant.id}
                onChange={(criterionId, value, maxScore) => updateValue(contestant.id, criterionId, value, maxScore)} />
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="shrink-0 text-sm text-ink-500">本批 <strong className="num text-ink-800">{completed}/{data.contestants.length}</strong> 已完成</span>
          <button type="button" onClick={openConfirmation} disabled={completed + partial === 0}
            className="h-13 flex-1 rounded-xl bg-brand py-3 text-base font-bold text-white active:bg-brand-600 disabled:bg-ink-200">检查并提交评分</button>
        </div>
      </div>

      <Modal open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} title="确认提交本批评分" width="max-w-xl">
        <p className="mb-3 text-sm text-ink-500">提交后不可修改，请核对每位选手的合成总分。</p>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {data.contestants.map((contestant) => (
            <div key={contestant.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2.5 text-sm">
              <span><span className="num mr-2 text-ink-400">{contestant.number}</span>{contestant.name}</span>
              <span className={`num font-semibold ${statusOf(contestant.id) === "empty" ? "text-orange-600" : "text-brand"}`}>
                {statusOf(contestant.id) === "empty" ? "未评分，按 0.00 分计" : `${totalFor(contestant.id)?.toFixed(2)} 分`}
              </span>
            </div>
          ))}
        </div>
        {empty > 0 && <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700">有 {empty} 位完全未评分选手，将按 0 分提交。</p>}
        <div className="mt-5 flex gap-3">
          <button type="button" className="h-11 flex-1 rounded-lg border border-ink-200" disabled={submitting} onClick={() => setConfirmOpen(false)}>再检查下</button>
          <button type="button" className="h-11 flex-1 rounded-lg bg-brand font-bold text-white disabled:bg-ink-200" disabled={submitting} onClick={submit}>{submitting ? "提交中…" : "确认提交"}</button>
        </div>
      </Modal>
      {dialogNode}
    </div>
  );
}

function ContestantScoreCard({ contestant, criteria, mode, values, status, total, highlighted, onChange }: {
  contestant: JudgeContestant;
  criteria: CriterionConfig[];
  mode: ScoreMode;
  values: ItemValues;
  status: "empty" | "partial" | "complete";
  total: number | null;
  highlighted: boolean;
  onChange: (criterionId: string, value: string, maxScore: number) => void;
}) {
  const contributions = status === "complete" ? computeCriteriaContributions(mode, criteria, criteria.map((criterion) => ({
    criterionId: criterion.id,
    score: Number(values[criterion.id]),
  }))) : [];

  return (
    <div className={`rounded-card bg-white p-4 shadow-card transition ${highlighted ? "ring-2 ring-orange-400" : ""}`}>
      <div className="flex items-center gap-3 border-b border-ink-100 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={contestantImg(contestant.image)} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold"><span className="num mr-1.5 text-brand">{contestant.number}</span>{contestant.name}</p>
          {contestant.intro && <p className="mt-0.5 truncate text-xs text-ink-300">{contestant.intro}</p>}
        </div>
        <span data-testid={`judge-status-${contestant.name}`} className={`rounded-full px-2.5 py-1 text-xs ${status === "complete" ? "bg-green-50 text-green-600" : status === "partial" ? "bg-orange-50 text-orange-600" : "bg-ink-50 text-ink-400"}`}>
          {status === "complete" ? "已完成" : status === "partial" ? "填写中" : "未评分"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {criteria.map((criterion, index) => {
          const value = values[criterion.id] ?? "";
          return (
            <div key={criterion.id} className="rounded-xl bg-ink-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-ink-700"><span className="num mr-1.5 text-ink-300">{index + 1}.</span>{criterion.name}</span>
                <span className="shrink-0 text-xs text-ink-400">满分 {criterion.maxScore}{mode === "weighted" ? ` · 比例 ${criterion.weight}%` : ""}</span>
              </div>
              <div className="flex items-center justify-center gap-4">
                <button type="button" aria-label={`${contestant.name}-${criterion.name}减1`} onClick={() => onChange(criterion.id, String(Math.max(0, Number(value || 0) - 1)), criterion.maxScore)}
                  className="h-11 w-11 rounded-full bg-white text-xl font-bold text-ink-500 shadow-sm active:bg-ink-100">−</button>
                <input aria-label={`${contestant.name}-${criterion.name}`} type="text" inputMode="numeric" autoComplete="off" value={value}
                  onFocus={(event) => event.target.select()} onChange={(event) => onChange(criterion.id, event.target.value, criterion.maxScore)}
                  placeholder="—" className="h-12 w-24 border-b-2 border-brand bg-transparent text-center text-2xl font-bold num outline-none placeholder:text-ink-200" />
                <button type="button" aria-label={`${contestant.name}-${criterion.name}加1`} onClick={() => onChange(criterion.id, String(Math.min(criterion.maxScore, Number(value || 0) + 1)), criterion.maxScore)}
                  className="h-11 w-11 rounded-full bg-brand text-xl font-bold text-white shadow-sm active:bg-brand-600">+</button>
              </div>
              <p className="mt-1 text-center text-xs text-ink-400">折算贡献 {status === "complete" ? contributions[index].contribution.toFixed(2) : "—"}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
        <span className="text-sm text-brand-700">合成总分</span>
        <span data-testid={`judge-total-${contestant.name}`} className="num text-2xl font-bold text-brand">{total === null ? "—" : total.toFixed(2)}<span className="ml-1 text-xs font-normal text-ink-400">/ 100</span></span>
      </div>
    </div>
  );
}
