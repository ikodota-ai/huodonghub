import path from "path";
import fs from "fs";
import { mediaKey } from "./codes";

export const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || "./media");
export const TMP_ROOT = path.join(MEDIA_ROOT, "tmp");

export function ensureDirs() {
  for (const dir of [MEDIA_ROOT, TMP_ROOT, path.join(MEDIA_ROOT, "videos"), path.join(MEDIA_ROOT, "covers"), path.join(MEDIA_ROOT, "images")]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export interface SaveResult {
  relPath: string; // 相对 MEDIA_ROOT 的路径，存 DB
  absPath: string;
}

export function allocVideoPath(filename: string): SaveResult {
  ensureDirs();
  const ext = (path.extname(filename) || ".mp4").toLowerCase();
  const key = mediaKey(16);
  const rel = path.join("videos", key, `video${ext}`);
  return { relPath: rel, absPath: path.join(MEDIA_ROOT, rel) };
}

export function allocCoverPath(): SaveResult {
  ensureDirs();
  const rel = path.join("covers", `${mediaKey(12)}.jpg`);
  return { relPath: rel, absPath: path.join(MEDIA_ROOT, rel) };
}

export function allocImagePath(filename: string): SaveResult {
  ensureDirs();
  const ext = (path.extname(filename) || ".jpg").toLowerCase();
  const rel = path.join("images", `${mediaKey(12)}${ext}`);
  return { relPath: rel, absPath: path.join(MEDIA_ROOT, rel) };
}

export function absOf(relPath: string): string {
  return path.join(MEDIA_ROOT, relPath);
}

export function removeFile(relPath: string | null | undefined) {
  if (!relPath) return;
  try {
    const abs = absOf(relPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    const dir = path.dirname(abs);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {}
}

export function dirSizeBytes(dir: string): number {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(p);
    else total += fs.statSync(p).size;
  }
  return total;
}
