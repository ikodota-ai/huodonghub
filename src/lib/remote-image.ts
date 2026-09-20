import path from "path";
import fs from "fs";
import { allocImagePath } from "./storage";
import { getDriver } from "./storage-driver";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 12 * 1000;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// 下载远程图片到媒体库（选手照片批量导入用），失败返回 null（不阻断导入）
export async function fetchImageToMedia(url: string): Promise<string | null> {
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Huodongpeitai/1.0)" },
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const urlExt = path.extname(new URL(url).pathname).toLowerCase();
    const ext = EXT_BY_TYPE[type] || ([".jpg", ".jpeg", ".png", ".webp"].includes(urlExt) ? urlExt : null);
    if (!ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;

    const alloc = allocImagePath(`remote${ext}`);
    fs.mkdirSync(path.dirname(alloc.absPath), { recursive: true });
    fs.writeFileSync(alloc.absPath, buf);
    const driver = await getDriver();
    if (driver.name === "oss") {
      await driver.put(alloc.relPath, alloc.absPath);
      fs.unlinkSync(alloc.absPath);
    }
    return alloc.relPath;
  } catch {
    return null;
  }
}
