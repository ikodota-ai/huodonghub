import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { canAccess, voteOwnerByRound } from "@/lib/ownership";
import { isRoundDraft } from "@/lib/round-lifecycle";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  status: z.enum(["pending", "active", "paused", "finished"]).optional(),
  audienceStartAt: z.string().datetime().nullable().optional(),
  audienceEndAt: z.string().datetime().nullable().optional(),
  screenShowResult: z.number().int().min(0).max(1).optional(),
  audienceShowResult: z.number().int().min(0).max(1).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!canAccess(user, await voteOwnerByRound(BigInt(params.id)))) return fail("轮次不存在", 404);
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const d = parsed.data;
    await db.voteRound.update({
      where: { id: BigInt(params.id) },
      data: {
        ...d,
        audienceStartAt: d.audienceStartAt === undefined ? undefined : d.audienceStartAt ? new Date(d.audienceStartAt) : null,
        audienceEndAt: d.audienceEndAt === undefined ? undefined : d.audienceEndAt ? new Date(d.audienceEndAt) : null,
      },
    });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!canAccess(user, await voteOwnerByRound(BigInt(params.id)))) return fail("轮次不存在", 404);
    const roundId = BigInt(params.id);
    const round = await db.voteRound.findUnique({ where: { id: roundId }, select: { id: true, status: true } });
    if (!round) return fail("轮次不存在", 404);
    if (!isRoundDraft(round.status)) {
      const [scoreCount, voteCount] = await Promise.all([
        db.scoreEntry.count({ where: { group: { roundId } } }),
        db.voteEntry.count({ where: { group: { roundId } } }),
      ]);
      if (scoreCount > 0 || voteCount > 0) return fail("轮次已开始，不能删除已有评分或投票的轮次", 409);
    }
    await db.voteRound.delete({ where: { id: round.id } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
