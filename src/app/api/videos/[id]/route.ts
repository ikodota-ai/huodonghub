import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { getDriver } from "@/lib/storage-driver";
import { canAccess, groupOwnerByVideo } from "@/lib/ownership";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  status: z.number().int().min(0).max(1).optional(),
  coverPath: z.string().max(255).nullable().optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!canAccess(user, await groupOwnerByVideo(BigInt(params.id)))) return fail("视频不存在", 404);
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.video.update({ where: { id: BigInt(params.id) }, data: parsed.data });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    if (!canAccess(user, await groupOwnerByVideo(BigInt(params.id)))) return fail("视频不存在", 404);
    const video = await db.video.findUnique({ where: { id: BigInt(params.id) } });
    if (!video) return fail("视频不存在", 404);
    const driver = await getDriver();
    if (video.filePath) await driver.remove(video.filePath);
    if (video.coverPath) await driver.remove(video.coverPath);
    await db.video.delete({ where: { id: video.id } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}
