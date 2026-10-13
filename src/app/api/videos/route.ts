import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

// 创建"视频号外链"条目：不入库视频文件，集合页点击后微信内跳转视频号播放
const schema = z.object({
  groupId: z.coerce.bigint(),
  title: z.string().min(1).max(255),
  sourceUrl: z.string().max(500).includes("weixin.qq.com/sph/", { message: "请填写视频号链接（https://weixin.qq.com/sph/...）" }),
  coverPath: z.string().max(255).nullish(),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + (parsed.error.issues[0]?.message ?? ""));
    const { groupId, title, sourceUrl, coverPath } = parsed.data;

    const group = await db.videoGroup.findUnique({ where: { id: groupId } });
    if (!group) return fail("分组不存在", 404);

    const maxSort = await db.video.aggregate({ where: { groupId }, _max: { sort: true } });
    const video = await db.video.create({
      data: {
        groupId,
        title,
        filePath: "",
        fileSize: 0,
        duration: 0,
        source: "external",
        sourceUrl,
        coverPath: coverPath || null,
        sort: (maxSort._max.sort ?? 0) + 1,
        processStatus: "ready",
      },
    });
    return ok({ id: video.id.toString() });
  } catch (e) {
    return handleError(e);
  }
}
