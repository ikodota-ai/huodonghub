import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { fetchImageToMedia } from "@/lib/remote-image";

const schema = z.object({
  voteId: z.coerce.bigint(),
  items: z.array(z.object({
    name: z.string().min(1).max(128),
    intro: z.string().max(1000).optional().default(""),
    image: z.string().max(500).optional().default(""),
  })).min(1).max(500),
});

// CSV 批量导入（客户端解析后传 JSON）；第三列图片 URL 由服务端下载入媒体库，失败不阻断
export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + parsed.error.issues[0]?.message);
    const { voteId, items } = parsed.data;
    const agg = await db.voteContestant.aggregate({ where: { voteId }, _max: { sort: true }, _count: true });
    let sort = agg._max.sort ?? 0;
    let num = agg._count ?? 0;

    // 图片下载：并发 5，单张失败记数不阻断
    let imageOk = 0, imageFail = 0;
    const images: (string | null)[] = new Array(items.length).fill(null);
    const queue = items.map((item, i) => ({ item, i })).filter(({ item }) => item.image.trim());
    for (let i = 0; i < queue.length; i += 5) {
      await Promise.all(queue.slice(i, i + 5).map(async ({ item, i: idx }) => {
        const rel = await fetchImageToMedia(item.image.trim());
        if (rel) { images[idx] = rel; imageOk++; } else { imageFail++; }
      }));
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await db.voteContestant.create({
        data: {
          voteId, name: item.name, intro: item.intro || null, image: images[i],
          number: String(++num).padStart(2, "0"), sort: ++sort,
        },
      });
    }
    return ok({ imported: items.length, imageOk, imageFail });
  } catch (e) {
    return handleError(e);
  }
}
