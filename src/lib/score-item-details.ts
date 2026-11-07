import { computeCriteriaContributions, type CriterionConfig, type ScoreMode } from "./score-criteria";

export interface StoredScoreItem {
  criterionId: string;
  score: number;
}

export interface ScoreItemDetail {
  criterionId: string;
  name: string;
  maxScore: number;
  weight: number | null;
  score: number | null;
  contribution: number | null;
}

export function buildScoreItemDetails(mode: ScoreMode, criteria: CriterionConfig[], items: StoredScoreItem[]): ScoreItemDetail[] {
  if (mode === "single") return [];
  const itemMap = new Map(items.map((item) => [item.criterionId, item.score]));
  const complete = criteria.every((criterion) => Number.isInteger(itemMap.get(criterion.id)));
  let contributions: number[] = [];
  if (complete) {
    try {
      contributions = computeCriteriaContributions(mode, criteria, criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: itemMap.get(criterion.id)!,
      }))).map((item) => item.contribution);
    } catch {
      contributions = [];
    }
  }
  return criteria.map((criterion, index) => ({
    criterionId: criterion.id,
    name: criterion.name,
    maxScore: criterion.maxScore,
    weight: criterion.weight,
    score: itemMap.get(criterion.id) ?? null,
    contribution: contributions[index] ?? null,
  }));
}
