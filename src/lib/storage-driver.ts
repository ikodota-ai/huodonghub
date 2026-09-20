import path from "path";
import fs from "fs";
import { MEDIA_ROOT, absOf } from "./storage";
import { getStorageConfig, OssConfig } from "./settings";

export interface StorageDriver {
  name: "local" | "oss";
  put(relPath: string, absLocalPath: string): Promise<void>;
  url(relPath: string): Promise<string>;
  remove(relPath: string): Promise<void>;
  test(): Promise<string>;
}

const localDriver: StorageDriver = {
  name: "local",
  async put() {},
  async url(relPath) {
    return `/api/media/${relPath.split(path.sep).join("/")}`;
  },
  async remove(relPath) {
    const abs = absOf(relPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  },
  async test() {
    return fs.existsSync(MEDIA_ROOT) ? "本地媒体目录可用" : "媒体目录不存在";
  },
};

function ossClient(cfg: OssConfig) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  return new OSS({
    region: cfg.region,
    bucket: cfg.bucket,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
  });
}

function makeOssDriver(cfg: OssConfig): StorageDriver {
  const keyOf = (relPath: string) => cfg.prefix + relPath.split(path.sep).join("/");
  return {
    name: "oss",
    async put(relPath, absLocalPath) {
      await ossClient(cfg).put(keyOf(relPath), absLocalPath);
    },
    async url(relPath) {
      const key = keyOf(relPath);
      if (cfg.publicDomain) return `${cfg.publicDomain.replace(/\/$/, "")}/${key}`;
      if (cfg.private) {
        return ossClient(cfg).signatureUrl(key, { expires: 6 * 3600 });
      }
      return `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${key}`;
    },
    async remove(relPath) {
      try { await ossClient(cfg).delete(keyOf(relPath)); } catch {}
    },
    async test() {
      const client = ossClient(cfg);
      await client.put(`${cfg.prefix}.ping`, Buffer.from("ok"));
      await client.delete(`${cfg.prefix}.ping`);
      return "OSS 连接与读写正常";
    },
  };
}

export async function getDriver(): Promise<StorageDriver> {
  const cfg = await getStorageConfig();
  if (cfg.driver === "oss" && cfg.oss.region && cfg.oss.bucket && cfg.oss.accessKeyId) {
    return makeOssDriver(cfg.oss);
  }
  return localDriver;
}

export async function mediaUrl(relPath: string | null | undefined): Promise<string> {
  if (!relPath) return "";
  const driver = await getDriver();
  return driver.url(relPath);
}
