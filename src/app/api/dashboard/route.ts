import { requireUser } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { MEDIA_ROOT, dirSizeBytes } from "@/lib/storage";
import { getSetting } from "@/lib/settings";
import { execFile } from "child_process";
import fs from "fs";
import { ownerWhere, canSeeAll } from "@/lib/ownership";
import type { User } from "@prisma/client";

export interface HealthItem {
  key: string;
  level: "ok" | "warn" | "alert";
  label: string;
  detail: string;
}

// ffmpeg 可用性检查结果缓存 10 分钟
let ffmpegCache: { ok: boolean; at: number } | null = null;
function ffmpegAvailable(): Promise<boolean> {
  if (ffmpegCache && Date.now() - ffmpegCache.at < 10 * 60 * 1000) return Promise.resolve(ffmpegCache.ok);
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-version"], { timeout: 5000 }, (err) => {
      ffmpegCache = { ok: !err, at: Date.now() };
      resolve(!err);
    });
  });
}

async function buildHealth(user: User): Promise<HealthItem[]> {
  const items: HealthItem[] = [];

  if (canSeeAll(user)) {
    // 备份新鲜度与磁盘占用为系统级指标，仅 admin/maintainer 可见
    const lastBackup = await getSetting("backup.last");
    if (!lastBackup) {
      items.push({ key: "backup", level: "alert", label: "数据备份", detail: "从未备份。请配置每日备份 cron（见 doc/deployment.md）或在系统设置手动备份" });
    } else {
      const days = (Date.now() - new Date(lastBackup).getTime()) / 86400000;
      items.push(days > 3
        ? { key: "backup", level: "warn", label: "数据备份", detail: `最近备份在 ${Math.floor(days)} 天前，请检查 cron 是否正常运行` }
        : { key: "backup", level: "ok", label: "数据备份", detail: `最近备份 ${days < 1 ? "今天" : `${Math.floor(days)} 天前`}` });
    }
    try {
      const st = fs.statfsSync(MEDIA_ROOT);
      const total = st.blocks * st.bsize;
      const used = total - st.bavail * st.bsize;
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      items.push(pct > 90
        ? { key: "disk", level: "alert", label: "磁盘空间", detail: `已用 ${pct}%，请尽快清理或扩容（备份与视频都在占空间）` }
        : pct > 80
          ? { key: "disk", level: "warn", label: "磁盘空间", detail: `已用 ${pct}%，建议规划清理` }
          : { key: "disk", level: "ok", label: "磁盘空间", detail: `已用 ${pct}%` });
    } catch {
      items.push({ key: "disk", level: "warn", label: "磁盘空间", detail: "无法读取磁盘信息" });
    }
  }

  // 转码失败任务（按内容归属过滤）
  const failedVideos = await db.video.count({ where: { processStatus: "failed", group: ownerWhere(user) } });
  items.push(failedVideos > 0
    ? { key: "pipeline", level: "warn", label: "视频处理", detail: `${failedVideos} 个视频转码失败，请到分组详情重试` }
    : { key: "pipeline", level: "ok", label: "视频处理", detail: "无失败任务" });

  // ffmpeg 可用性
  const ff = await ffmpegAvailable();
  items.push(ff
    ? { key: "ffmpeg", level: "ok", label: "ffmpeg", detail: "正常" }
    : { key: "ffmpeg", level: "alert", label: "ffmpeg", detail: "不可用！视频上传后将无法处理，请安装 ffmpeg" });

  return items;
}

export async function GET() {
  try {
    const user = await requireUser();
    const scope = ownerWhere(user);
    const [groupCount, videoCount, activeVoteCount, activeRoundCount, recentGroups, recentVotes] = await Promise.all([
      db.videoGroup.count({ where: scope }),
      db.video.count({ where: { group: scope } }),
      db.vote.count({ where: { status: "active", ...scope } }),
      db.voteRound.count({ where: { status: "active", vote: scope } }),
      db.videoGroup.findMany({ where: scope, orderBy: { updatedAt: "desc" }, take: 5, include: { _count: { select: { videos: true } } } }),
      db.vote.findMany({ where: scope, orderBy: { updatedAt: "desc" }, take: 5, include: { _count: { select: { rounds: true } } } }),
    ]);
    const sizeAgg = await db.video.aggregate({ where: { group: scope }, _sum: { fileSize: true } });
    const health = await buildHealth(user);
    return ok({
      groupCount, videoCount, activeVoteCount, activeRoundCount,
      videoBytes: (sizeAgg._sum.fileSize ?? BigInt(0)).toString(),
      mediaBytes: canSeeAll(user) ? dirSizeBytes(MEDIA_ROOT) : (sizeAgg._sum.fileSize ?? BigInt(0)).toString(),
      health,
      recentGroups: recentGroups.map((g) => ({ id: g.id.toString(), name: g.name, code: g.code, videoCount: g._count.videos, status: g.status })),
      recentVotes: recentVotes.map((v) => ({ id: v.id.toString(), name: v.name, status: v.status, roundCount: v._count.rounds })),
    });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
