import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  number: z.string().max(8).optional(),
  name: z.string().min(1).max(128).optional(),
  intro: z.string().max(1000).optional(),
  image: z.string().max(255).nullable().optional(),
  sort: z.number().int().optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.voteContestant.update({ where: { id: BigInt(params.id) }, data: parsed.data });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireUser();
    await db.voteContestant.delete({ where: { id: BigInt(params.id) } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
