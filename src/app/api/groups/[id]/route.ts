import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { getDriver } from "@/lib/storage-driver";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const group = await db.videoGroup.findUnique({
      where: { id: BigInt(params.id) },
      include: { videos: { orderBy: { sort: "asc" } } },
    });
    if (!group) return fail("分组不存在", 404);
    return ok({
      id: group.id.toString(), name: group.name, code: group.code, cover: group.cover,
      description: group.description, password: group.password ?? "", status: group.status,
      videos: group.videos.map((v) => ({
        id: v.id.toString(), title: v.title, duration: v.duration, fileSize: v.fileSize.toString(),
        coverPath: v.coverPath, filePath: v.filePath, source: v.source, sourceUrl: v.sourceUrl, sort: v.sort,
        status: v.status, processStatus: v.processStatus, width: v.width, height: v.height, views: v.views,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(500).optional(),
  password: z.string().max(64).nullable().optional(),
  cover: z.string().max(255).nullable().optional(),
  status: z.number().int().min(0).max(1).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    await db.videoGroup.update({ where: { id: BigInt(params.id) }, data: parsed.data });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const id = BigInt(params.id);
    const videos = await db.video.findMany({ where: { groupId: id } });
    const driver = await getDriver();
    for (const v of videos) {
      await driver.remove(v.filePath);
      if (v.coverPath) await driver.remove(v.coverPath);
    }
    await db.videoGroup.delete({ where: { id } });
    return ok(true);
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
