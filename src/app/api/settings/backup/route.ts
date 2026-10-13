import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { requireUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { MEDIA_ROOT } from "@/lib/storage";
import { getSetting, setSetting } from "@/lib/settings";

function run(cmd: string, args: string[], env?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: { ...process.env, ...env }, timeout: 10 * 60 * 1000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr?.slice(0, 300) || err.message));
      else resolve();
    });
  });
}

function findMysqldump(): string {
  const candidates = [
    "mysqldump",
    "/www/server/mysql/bin/mysqldump",
    "/usr/local/mysql/bin/mysqldump",
    "/usr/bin/mysqldump",
    "/usr/local/bin/mysqldump",
    "/opt/homebrew/bin/mysqldump",
  ];
  for (const c of candidates) {
    if (!c.includes("/")) {
      for (const dir of (process.env.PATH || "").split(":")) {
        if (fs.existsSync(path.join(dir, c))) return c;
      }
    } else if (fs.existsSync(c)) return c;
  }
  throw new Error("未找到 mysqldump，请在服务器安装 MySQL 客户端工具");
}

export async function GET() {
  try {
    await requireUser();
    const last = await getSetting("backup.last");
    return ok({ last });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return fail("仅管理员可操作", 403);
    const dbUrl = new URL(process.env.DATABASE_URL || "");
    const backupDir = path.join(MEDIA_ROOT, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const sqlFile = path.join(backupDir, `db_${stamp}.sql`);
    const tarFile = path.join(backupDir, `media_${stamp}.tar.gz`);

    await run(findMysqldump(), [
      `-h${dbUrl.hostname}`, `-P${dbUrl.port || "3306"}`, `-u${dbUrl.username}`,
      dbUrl.pathname.slice(1), `--result-file=${sqlFile}`,
    ], { MYSQL_PWD: decodeURIComponent(dbUrl.password) });

    const mediaDirs = fs.readdirSync(MEDIA_ROOT).filter((d) => d !== "backups" && d !== "tmp");
    await run("tar", ["-czf", tarFile, "-C", MEDIA_ROOT, ...mediaDirs]);

    const at = new Date().toISOString();
    await setSetting("backup.last", at);
    return ok({ at, files: [path.basename(sqlFile), path.basename(tarFile)] });
  } catch (e) {
    return handleError(e);
  }
}

// API 路由依赖请求态（cookies/query/DB），禁止构建期静态化（消除构建日志 Dynamic server usage 噪音）
export const dynamic = "force-dynamic";
