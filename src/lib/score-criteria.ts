export type ScoreMode = "single" | "sum" | "weighted";

export interface CriterionConfig {
  id: string;
  name: string;
  maxScore: number;
  weight: number | null;
  sort: number;
}

export interface CriterionItemInput {
  criterionId: string;
  score: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const weightPoints = (value: number) => Math.round(value * 100);

export function validateCriteria(mode: ScoreMode, maxScore: number, criteria: CriterionConfig[]): string | null {
  if (mode === "single") return criteria.length === 0 ? null : "整体评分不保存评分项";
  if (mode !== "sum" && mode !== "weighted") return "评分模式无效";
  if (maxScore !== 100) return "细分评分群体满分必须为 100";
  if (criteria.length < 2) return "细分评分至少 2 项";
  if (criteria.length > 10) return "细分评分最多 10 项";

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const item of criteria) {
    const id = item.id.trim();
    const name = item.name.trim();
    if (!id) return "评分项 ID 不能为空";
    if (ids.has(id)) return "评分项 ID 重复";
    ids.add(id);
    if (!name) return "评分项名称不能为空";
    const normalizedName = name.toLocaleLowerCase();
    if (names.has(normalizedName)) return "评分项名称不能重复";
    names.add(normalizedName);
    if (!Number.isFinite(item.maxScore) || !Number.isInteger(item.maxScore) || item.maxScore <= 0) return "评分项满分必须为正整数";
  }

  if (mode === "sum") {
    if (criteria.some((item) => item.weight !== null)) return "分值分配模式的评分项比例必须为空";
    const total = criteria.reduce((sum, item) => sum + item.maxScore, 0);
    return total === 100 ? null : `评分项满分合计必须等于 100，当前为 ${total}`;
  }

  if (criteria.some((item) => item.maxScore !== 100)) return "百分制加权的每项满分必须为 100";
  let totalWeightPoints = 0;
  for (const item of criteria) {
    if (item.weight === null || !Number.isFinite(item.weight)) return "百分制加权必须填写评分项比例";
    if (item.weight <= 0 || item.weight > 100) return "评分项比例必须大于 0 且不超过 100";
    if (Math.abs(item.weight * 100 - Math.round(item.weight * 100)) > 1e-8) return "评分项比例最多保留两位小数";
    totalWeightPoints += weightPoints(item.weight);
  }
  return totalWeightPoints === 10000 ? null : `评分项比例合计必须等于 100%，当前为 ${totalWeightPoints / 100}%`;
}

export function validateCriterionItems(criteria: CriterionConfig[], items: CriterionItemInput[]): string | null {
  const byId = new Map(criteria.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.criterionId)) return "评分项重复提交";
    seen.add(item.criterionId);
    const criterion = byId.get(item.criterionId);
    if (!criterion) return "评分项不属于当前群体";
    if (!Number.isFinite(item.score)) return "评分必须为有效数字";
    if (!Number.isInteger(item.score)) return "评分必须为整数";
    if (item.score < 0) return "评分不能小于 0";
    if (item.score > criterion.maxScore) return `评分不能超过 ${criterion.maxScore}`;
  }
  if (items.length !== criteria.length || seen.size !== byId.size) return "评分项填写不完整";
  return null;
}

export function computeScoreTotal(mode: ScoreMode, criteria: CriterionConfig[], items: CriterionItemInput[]): number {
  const configError = validateCriteria(mode, 100, criteria);
  if (configError) throw new Error(configError);
  const itemError = validateCriterionItems(criteria, items);
  if (itemError) throw new Error(itemError);
  const byId = new Map(items.map((item) => [item.criterionId, item.score]));
  if (mode === "sum") return round2(criteria.reduce((sum, criterion) => sum + (byId.get(criterion.id) ?? 0), 0));
  const weightedPoints = criteria.reduce((sum, criterion) => sum + (byId.get(criterion.id) ?? 0) * weightPoints(criterion.weight ?? 0), 0);
  return round2(weightedPoints / 10000);
}

export function computeCriteriaContributions(mode: ScoreMode, criteria: CriterionConfig[], items: CriterionItemInput[]) {
  const configError = validateCriteria(mode, 100, criteria);
  if (configError) throw new Error(configError);
  const itemError = validateCriterionItems(criteria, items);
  if (itemError) throw new Error(itemError);
  const byId = new Map(items.map((item) => [item.criterionId, item.score]));
  return criteria.map((criterion) => {
    const score = byId.get(criterion.id) ?? 0;
    return {
      criterionId: criterion.id,
      score,
      contribution: round2(mode === "sum" ? score : score * (criterion.weight ?? 0) / 100),
    };
  });
}
