import { execFile } from "child_process";
import fs from "fs";
import path from "path";

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} 失败: ${stderr?.slice(0, 500) || err.message}`));
      else resolve(stdout);
    });
  });
}

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
  size: number;
  videoCodec: string;
}

export async function probe(absPath: string): Promise<VideoMeta> {
  const out = await run("ffprobe", [
    "-v", "quiet", "-print_format", "json",
    "-show_format", "-show_streams", absPath,
  ]);
  const info = JSON.parse(out);
  const vs = (info.streams || []).find((s: { codec_type: string }) => s.codec_type === "video");
  return {
    duration: Math.round(parseFloat(info.format?.duration || "0")),
    width: vs?.width || 0,
    height: vs?.height || 0,
    size: parseInt(info.format?.size || "0", 10),
    videoCodec: vs?.codec_name || "",
  };
}

export async function ensureFaststart(absPath: string, codec: string): Promise<string> {
  const dir = path.dirname(absPath);
  const tmp = path.join(dir, "faststart_tmp.mp4");
  const isH264Mp4 = codec === "h264" && absPath.toLowerCase().endsWith(".mp4");
  if (isH264Mp4) {
    await run("ffmpeg", ["-y", "-i", absPath, "-c", "copy", "-movflags", "+faststart", tmp]);
  } else {
    await run("ffmpeg", [
      "-y", "-i", absPath,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", tmp,
    ]);
  }
  const finalPath = path.join(dir, "video.mp4");
  fs.renameSync(tmp, finalPath);
  if (finalPath !== absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
  return finalPath;
}

export async function screenshot(absVideo: string, absCover: string): Promise<void> {
  await run("ffmpeg", ["-y", "-ss", "1", "-i", absVideo, "-frames:v", "1", "-q:v", "3", absCover]);
}

export function processInBackground(job: () => Promise<void>) {
  setImmediate(() => {
    job().catch((e) => console.error("[pipeline]", e));
  });
}
