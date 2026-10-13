import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { TMP_ROOT } from "@/lib/storage";
import { token } from "@/lib/codes";
import { uploadSessions, saveUploadMeta, sweepStaleUploads } from "@/lib/uploads";
import fs from "fs";
import path from "path";

const schema = z.object({
  filename: z.string().min(1),
  size: z.number().int().positive(),
  chunks: z.number().int().positive().max(2000),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("参数错误");
    const { filename, size, chunks } = parsed.data;
    const ext = path.extname(filename).toLowerCase();
    if (![".mp4", ".mov", ".m4v"].includes(ext)) return fail("仅支持 MP4/MOV 格式");
    if (size > 4 * 1024 * 1024 * 1024) return fail("单文件不能超过 4GB");

    const id = token(12);
    const dir = path.join(TMP_ROOT, id);
    fs.mkdirSync(dir, { recursive: true });
    const session = { filename, size, chunks, received: new Set<number>(), dir };
    uploadSessions.set(id, session);
    saveUploadMeta(session);   // 落盘：进程重启后 getUpload 可从磁盘恢复
    sweepStaleUploads();       // 顺带清理 24h 前的孤儿上传目录
    return ok({ uploadId: id });
  } catch (e) {
    return handleError(e);
  }
}
