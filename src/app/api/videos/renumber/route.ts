import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { episodeTitle } from "@/lib/cn-number";

// 按 sort 顺序对分组内全部视频重排"第N集"序号（幂等：先剥离旧前缀再加新前缀）
const schema = z.object({ groupId: z.coerce.bigint() });

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const { groupId } = parsed.data;
    const videos = await db.video.findMany({ where: { groupId }, orderBy: { sort: "asc" }, select: { id: true, title: true } });
    if (videos.length === 0) return fail("分组内还没有视频");
    if (videos.length > 99) return fail("超过 99 个视频，暂不支持自动编号");
    await db.$transaction(
      videos.map((v, i) => db.video.update({ where: { id: v.id }, data: { title: episodeTitle(i + 1, v.title) } }))
    );
    return ok({ count: videos.length });
  } catch (e) {
    return handleError(e);
  }
}
