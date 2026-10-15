import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { canAccess } from "@/lib/ownership";

// 创建"视频号外链"条目（支持批量）：不入库视频文件，集合页点击后微信内跳转视频号播放
const itemSchema = z.object({
  title: z.string().min(1).max(255),
  sourceUrl: z.string().max(500).includes("weixin.qq.com/sph/", { message: "请填写视频号链接（https://weixin.qq.com/sph/...）" }),
  coverPath: z.string().max(255).nullish(),
});

const schema = z.object({
  groupId: z.coerce.bigint(),
  items: z.array(itemSchema).min(1, "至少一条").max(200, "单次最多 200 条"),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + (parsed.error.issues[0]?.message ?? ""));
    const { groupId, items } = parsed.data;

    const group = await db.videoGroup.findUnique({ where: { id: groupId } });
    if (!group || !canAccess(user, group.ownerId)) return fail("分组不存在", 404);

    const maxSort = await db.video.aggregate({ where: { groupId }, _max: { sort: true } });
    const base = (maxSort._max.sort ?? 0) + 1;
    await db.$transaction(
      items.map((it, i) =>
        db.video.create({
          data: {
            groupId,
            title: it.title,
            filePath: "",
            fileSize: 0,
            duration: 0,
            source: "external",
            sourceUrl: it.sourceUrl,
            coverPath: it.coverPath || null,
            sort: base + i,
            processStatus: "ready",
          },
        })
      )
    );
    return ok({ count: items.length });
  } catch (e) {
    return handleError(e);
  }
}
