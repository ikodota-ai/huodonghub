import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { getUpload } from "@/lib/uploads";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const uploadId = url.searchParams.get("uploadId") || "";
    const index = parseInt(url.searchParams.get("index") || "-1", 10);
    const up = getUpload(uploadId);
    if (!up) return fail("上传会话不存在或已过期", 404);
    if (index < 0 || index >= up.chunks) return fail("分片序号错误");

    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) return fail("空分片");
    fs.writeFileSync(path.join(up.dir, String(index)), buf);
    up.received.add(index);
    return ok({ received: up.received.size, total: up.chunks });
  } catch (e) {
    return handleError(e);
  }
}
