import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({ contestantIds: z.array(z.coerce.bigint()).max(500) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const roundId = BigInt(params.id);
    await db.$transaction([
      db.roundContestant.deleteMany({ where: { roundId } }),
      db.roundContestant.createMany({
        data: parsed.data.contestantIds.map((contestantId) => ({ roundId, contestantId })),
      }),
    ]);
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
