import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  kind: z.enum(["score", "vote"]).optional(),
  weight: z.number().min(0).max(100).optional(),
  maxScore: z.number().int().min(1).max(10000).optional(),
  maxVotes: z.number().int().min(1).max(100).optional(),
  allowRepeat: z.number().int().min(0).max(1).optional(),
  fixedPoints: z.number().positive().nullable().optional(),
  restricted: z.number().int().min(0).max(1).optional(),
  sort: z.number().int().optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.voteGroup.update({ where: { id: BigInt(params.id) }, data: parsed.data });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireUser();
    await db.voteGroup.delete({ where: { id: BigInt(params.id) } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
