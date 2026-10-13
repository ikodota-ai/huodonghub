import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { getUpload } from "@/lib/uploads";
import { allocVideoPath } from "@/lib/storage";
import { kickPipeline } from "@/lib/pipeline";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

const schema = z.object({
  uploadId: z.string().min(1),
  groupId: z.coerce.bigint(),
  title: z.string().min(1).max(255),
  source: z.enum(["upload", "rescue"]).default("upload"),
  sourceUrl: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误：" + parsed.error.issues[0]?.message);
    const { uploadId, groupId, title, source, sourceUrl } = parsed.data;
    const up = getUpload(uploadId);
    if (!up) return fail("上传会话不存在或已过期", 404);
    if (up.received.size < up.chunks) return fail(`分片不完整（${up.received.size}/${up.chunks}）`);

    const group = await db.videoGroup.findUnique({ where: { id: groupId } });
    if (!group) return fail("分组不存在", 404);

    const alloc = allocVideoPath(up.filename);
    fs.mkdirSync(path.dirname(alloc.absPath), { recursive: true });
    const out = fs.createWriteStream(alloc.absPath);
    for (let i = 0; i < up.chunks; i++) {
      const chunkPath = path.join(up.dir, String(i));
      // 等 drain 再写下一片：否则大文件在内存排队，把进程内存顶爆触发 pm2 重启
      if (!out.write(fs.readFileSync(chunkPath))) {
        await new Promise<void>((resolve) => out.once("drain", resolve));
      }
    }
    out.end();
    await new Promise<void>((resolve) => out.on("finish", resolve));
    fs.rmSync(up.dir, { recursive: true, force: true });

    const maxSort = await db.video.aggregate({ where: { groupId }, _max: { sort: true } });
    const video = await db.video.create({
      data: {
        groupId,
        title,
        filePath: alloc.relPath,
        fileSize: up.size,
        source,
        sourceUrl,
        sort: (maxSort._max.sort ?? 0) + 1,
        processStatus: "processing",
      },
    });

    kickPipeline(video.id);

    return ok({ id: video.id.toString() });
  } catch (e) {
    return handleError(e);
  }
}
