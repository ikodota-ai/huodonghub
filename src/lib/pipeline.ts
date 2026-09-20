import path from "path";
import fs from "fs";
import { db } from "./db";
import { allocCoverPath, absOf } from "./storage";
import { probe, ensureFaststart, screenshot } from "./ffmpeg";
import { getDriver } from "./storage-driver";

// 视频处理流水线：探测 → faststart/转码 → 截封面 → 按驱动推送 OSS → 更新记录
export async function runVideoPipeline(videoId: bigint): Promise<void> {
  const video = await db.video.findUniqueOrThrow({ where: { id: videoId } });
  const absInput = absOf(video.filePath);
  try {
    const meta = await probe(absInput);
    const finalAbs = await ensureFaststart(absInput, meta.videoCodec);
    const cover = allocCoverPath();
    await screenshot(finalAbs, cover.absPath);

    const relFinal = path.join(path.dirname(video.filePath), path.basename(finalAbs));
    const finalMeta = await probe(finalAbs);

    const driver = await getDriver();
    if (driver.name === "oss") {
      await driver.put(relFinal, finalAbs);
      await driver.put(cover.relPath, cover.absPath);
      // OSS 模式下清理本地副本节省服务器磁盘
      fs.unlinkSync(finalAbs);
      fs.unlinkSync(cover.absPath);
    }

    await db.video.update({
      where: { id: videoId },
      data: {
        filePath: relFinal,
        duration: finalMeta.duration,
        width: finalMeta.width,
        height: finalMeta.height,
        fileSize: BigInt(finalMeta.size),
        coverPath: cover.relPath,
        processStatus: "ready",
      },
    });
  } catch (e) {
    console.error("[pipeline]", e);
    await db.video.update({ where: { id: videoId }, data: { processStatus: "failed" } });
    throw e;
  }
}

export function kickPipeline(videoId: bigint) {
  setImmediate(() => {
    runVideoPipeline(videoId).catch(() => {});
  });
}
