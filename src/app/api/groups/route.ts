import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { shortCode } from "@/lib/codes";
import { ownerWhere } from "@/lib/ownership";

export async function GET() {
  try {
    const user = await requireUser();
    const groups = await db.videoGroup.findMany({
      where: ownerWhere(user),
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { videos: true } }, videos: { where: { coverPath: { not: null } }, select: { coverPath: true }, take: 1, orderBy: { sort: "asc" } } },
    });
    return ok(groups.map((g) => ({
      id: g.id.toString(), name: g.name, code: g.code, cover: g.cover,
      fallbackCover: g.videos[0]?.coverPath ?? null,
      description: g.description, hasPassword: !!g.password, status: g.status,
      videoCount: g._count.videos, updatedAt: g.updatedAt,
    })));
  } catch (e) {
    return handleError(e);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(500).optional(),
  password: z.string().max(64).optional().or(z.literal("")),
  status: z.number().int().min(0).max(1).default(1),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + parsed.error.issues[0]?.message);
    const group = await db.videoGroup.create({
      data: { ...parsed.data, password: parsed.data.password || null, code: shortCode(8), ownerId: user.id },
    });
    return ok({ id: group.id.toString(), code: group.code });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
