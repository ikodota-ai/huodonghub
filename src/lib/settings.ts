import { db } from "./db";

type SettingCacheEntry = {
  value: string | null;
  expiresAt: number;
  pending: Promise<string | null> | null;
};

const globalForSettings = globalThis as unknown as { __dthSettingCache?: Map<string, SettingCacheEntry> };
const settingCache = globalForSettings.__dthSettingCache ?? new Map<string, SettingCacheEntry>();
globalForSettings.__dthSettingCache = settingCache;
const SETTING_CACHE_TTL_MS = 1000;

export async function getSetting(key: string): Promise<string | null> {
  const cached = settingCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.pending) return cached.pending;
  const entry: SettingCacheEntry = { value: null, expiresAt: 0, pending: null };
  entry.pending = db.setting.findUnique({ where: { key } }).then((row) => {
    const value = row?.value ?? null;
    if (settingCache.get(key) === entry) {
      entry.value = value;
      entry.expiresAt = Date.now() + SETTING_CACHE_TTL_MS;
    }
    return value;
  }).finally(() => { entry.pending = null; });
  settingCache.set(key, entry);
  return entry.pending;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  settingCache.delete(key);
}

export interface OssConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  prefix: string;      // 对象前缀，如 dth/
  publicDomain: string; // 自定义/CDN 域名（含协议），为空用 bucket 公网地址
  private: boolean;    // 私有桶 → 签名 URL
}

export interface StorageConfig {
  driver: "local" | "oss";
  oss: OssConfig;
}

export async function getStorageConfig(): Promise<StorageConfig> {
  const raw = await getSetting("storage.config");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StorageConfig;
      if (parsed.driver === "local" || parsed.driver === "oss") return parsed;
    } catch {}
  }
  return {
    driver: (process.env.STORAGE_DRIVER as "local" | "oss") || "local",
    oss: {
      region: process.env.OSS_REGION || "",
      bucket: process.env.OSS_BUCKET || "",
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
      prefix: process.env.OSS_PREFIX || "dth/",
      publicDomain: process.env.OSS_PUBLIC_DOMAIN || "",
      private: process.env.OSS_PRIVATE === "1",
    },
  };
}

export interface WxGlobalConfig {
  appid: string;
  secret: string;
  name: string; // 备注名，如"台里服务号"
}

export async function getWxGlobalConfig(): Promise<WxGlobalConfig> {
  const raw = await getSetting("wx.default");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WxGlobalConfig;
      return { appid: parsed.appid || "", secret: parsed.secret || "", name: parsed.name || "" };
    } catch {}
  }
  return {
    appid: process.env.WX_APPID || "",
    secret: process.env.WX_SECRET || "",
    name: process.env.WX_NAME || "",
  };
}

export interface EffectiveWxConfig {
  appid: string;
  secret: string;
  source: "vote" | "global";
  sourceName: string; // 展示用：投票自定义 / 全局默认（备注名）
}

// 解析投票实际生效的公众号配置：投票自定义优先，留空则跟随全局默认，均未配置返回 null（指纹模式）
export async function getWxConfigFor(vote: { wxAppid: string | null; wxSecret: string | null }): Promise<EffectiveWxConfig | null> {
  if (vote.wxAppid && vote.wxSecret) {
    return { appid: vote.wxAppid, secret: vote.wxSecret, source: "vote", sourceName: "本投票自定义" };
  }
  const global = await getWxGlobalConfig();
  if (global.appid && global.secret) {
    return { appid: global.appid, secret: global.secret, source: "global", sourceName: `全局默认${global.name ? `（${global.name}）` : ""}` };
  }
  return null;
}
