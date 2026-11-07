import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { canAccess, voteOwnerByRound } from "@/lib/ownership";
import { ScoreMode, validateCriteria } from "@/lib/score-criteria";

const criterionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(64),
  maxScore: z.number().int().positive().default(100),
  weight: z.number().positive().max(100).nullable().default(null),
  sort: z.number().int().min(0).optional(),
});

const schema = z.object({
  roundId: z.coerce.bigint(),
  name: z.string().min(1).max(64),
  kind: z.enum(["score", "vote"]),
  weight: z.number().min(0).max(100),
  maxScore: z.number().int().min(1).max(10000).default(100),
  maxVotes: z.number().int().min(1).max(100).default(3),
  allowRepeat: z.number().int().min(0).max(1).default(0),
  fixedPoints: z.number().positive().nullable().default(null),
  restricted: z.number().int().min(0).max(1).default(1),
  avgMode: z.enum(["scorers", "roster"]).default("scorers"),
  pctMode: z.enum(["batch", "round"]).default("batch"),
  votePeriod: z.enum(["total", "daily"]).default("total"),
  voteMode: z.enum(["participants", "top", "share"]).default("participants"),
  scoreMode: z.enum(["single", "sum", "weighted"]).default("single"),
  criteria: z.array(criterionSchema).default([]),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + parsed.error.issues[0]?.message);
    const d = parsed.data;
    if (!canAccess(user, await voteOwnerByRound(d.roundId))) return fail("轮次不存在", 404);
    if (d.kind === "vote" && (d.scoreMode !== "single" || d.criteria.length > 0)) return fail("投票群体不能配置评分项");
    const mode: ScoreMode = d.kind === "vote" ? "single" : d.scoreMode;
    const criteria = d.criteria.map((item, index) => ({ ...item, id: item.id ?? `new-${index + 1}`, sort: item.sort ?? index + 1 }));
    const configError = validateCriteria(mode, d.maxScore, criteria);
    if (configError) return fail(configError);
    const { criteria: ignoredCriteria, scoreMode: ignoredMode, ...fields } = d;
    void ignoredCriteria;
    void ignoredMode;
    const group = await db.$transaction(async (tx) => {
      const maxSort = await tx.voteGroup.aggregate({ where: { roundId: d.roundId }, _max: { sort: true } });
      return tx.voteGroup.create({
        data: {
          ...fields, scoreMode: mode, sort: (maxSort._max.sort ?? 0) + 1,
          scoreCriteria: {
            create: mode === "single" ? [] : criteria.map((item) => ({ name: item.name, maxScore: item.maxScore, weight: item.weight, sort: item.sort })),
          },
        },
      });
    });
    return ok({ id: group.id.toString() });
  } catch (e) {
    return handleError(e);
  }
}
