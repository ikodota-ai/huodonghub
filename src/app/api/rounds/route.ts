import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { shortCode } from "@/lib/codes";
import { canAccess } from "@/lib/ownership";

const schema = z.object({ voteId: z.coerce.bigint(), name: z.string().min(1).max(128) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const { voteId, name } = parsed.data;
    const vote = await db.vote.findUnique({ where: { id: voteId }, select: { ownerId: true } });
    if (!vote || !canAccess(user, vote.ownerId)) return fail("投票不存在", 404);
    const maxSeq = await db.voteRound.aggregate({ where: { voteId }, _max: { seq: true } });
    const prevRound = await db.voteRound.findFirst({
      where: { voteId }, orderBy: { seq: "desc" },
      include: { groups: true, roundContestants: true },
    });
    const round = await db.voteRound.create({
      data: {
        voteId, name, seq: (maxSeq._max.seq ?? 0) + 1, code: shortCode(8),
        groups: {
          create: prevRound?.groups.map((g) => ({
            name: g.name, kind: g.kind, weight: g.weight, maxScore: g.maxScore, maxVotes: g.maxVotes,
            allowRepeat: g.allowRepeat, fixedPoints: g.fixedPoints, restricted: g.restricted, sort: g.sort,
          })) ?? [],
        },
        roundContestants: {
          create: prevRound?.roundContestants.map((rc) => ({ contestantId: rc.contestantId, batch: rc.batch, seq: rc.seq })) ?? [],
        },
      },
    });
    return ok({ id: round.id.toString() });
  } catch (e) {
    return handleError(e);
  }
}
