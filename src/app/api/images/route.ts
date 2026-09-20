// 图片上传（封面/选手照片），multipart 单文件
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { allocImagePath } from "@/lib/storage";
import { getDriver } from "@/lib/storage-driver";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return fail("未收到文件");
    if (file.size > 10 * 1024 * 1024) return fail("图片不能超过 10MB");
    const ext = path.extname(file.name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return fail("仅支持 JPG/PNG/WebP");
    const alloc = allocImagePath(file.name);
    fs.mkdirSync(path.dirname(alloc.absPath), { recursive: true });
    fs.writeFileSync(alloc.absPath, Buffer.from(await file.arrayBuffer()));
    const driver = await getDriver();
    if (driver.name === "oss") {
      await driver.put(alloc.relPath, alloc.absPath);
      fs.unlinkSync(alloc.absPath);
    }
    return ok({ path: alloc.relPath, url: await driver.url(alloc.relPath) });
  } catch (e) {
    return handleError(e);
  }
}
