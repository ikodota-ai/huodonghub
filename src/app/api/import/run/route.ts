import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { downloadToFile } from "@/lib/wechat";
import { allocVideoPath } from "@/lib/storage";
import { kickPipeline } from "@/lib/pipeline";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

const schema = z.object({
  groupId: z.coerce.bigint(),
  sourceUrl: z.string().url(),
  items: z.array(z.object({ title: z.string().min(1).max(255), url: z.string().url() })).min(1).max(5),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const { groupId, sourceUrl, items } = parsed.data;
    const group = await db.videoGroup.findUnique({ where: { id: groupId } });
    if (!group) return fail("分组不存在", 404);

    const created: string[] = [];
    for (const item of items) {
      const alloc = allocVideoPath("import.mp4");
      fs.mkdirSync(path.dirname(alloc.absPath), { recursive: true });
      try {
        const size = await downloadToFile(item.url, alloc.absPath);
        const maxSort = await db.video.aggregate({ where: { groupId }, _max: { sort: true } });
        const video = await db.video.create({
          data: {
            groupId, title: item.title, filePath: alloc.relPath, fileSize: BigInt(size),
            source: "import", sourceUrl, sort: (maxSort._max.sort ?? 0) + 1, processStatus: "processing",
          },
        });
        kickPipeline(video.id);
        created.push(video.id.toString());
      } catch (e) {
        fs.rmSync(path.dirname(alloc.absPath), { recursive: true, force: true });
        return fail(`「${item.title}」下载失败：${(e as Error).message}，已成功的 ${created.length} 个保留`);
      }
    }
    return ok({ ids: created });
  } catch (e) {
    return handleError(e);
  }
}
