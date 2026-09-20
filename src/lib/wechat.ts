// 微信服务号网页授权（每次投票独立配置 AppID/Secret）
// 公众号文章视频解析（best-effort，页面结构变化时按失败处理）

export function wxAuthorizeUrl(appid: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    appid,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snsapi_base",
    state,
  });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${p}#wechat_redirect`;
}

export async function wxFetchOpenid(appid: string, secret: string, code: string): Promise<string | null> {
  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${secret}&code=${code}&grant_type=authorization_code`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as { openid?: string; errcode?: number };
  return json.openid ?? null;
}

export interface ParsedArticleVideo {
  vid: string;
  title: string;
  urls: { quality: string; url: string }[];
}

const WX_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": WX_UA, Referer: "https://mp.weixin.qq.com/" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`);
  return res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// 从文章 HTML 中提取 vid 列表
export function extractVidsFromArticle(html: string): string[] {
  const vids = new Set<string>();
  const patterns = [
    /[?&]vid=([a-zA-Z0-9_-]+)/g,
    /["'\s]vid["'\s:=]+["']?([a-zA-Z0-9_-]{6,})["']?/g,
    /data-vid=["']([a-zA-Z0-9_-]+)["']/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (/^wxv_|^wxg_|^[a-zA-Z0-9_-]{8,}$/.test(m[1])) vids.add(m[1]);
    }
  }
  return [...vids];
}

// 从视频播放页 HTML 解析播放地址
export function extractPlayUrls(html: string): { quality: string; url: string }[] {
  const out: { quality: string; url: string }[] = [];
  const seen = new Set<string>();
  const push = (quality: string, url: string) => {
    const u = decodeEntities(url).replace(/\\x26/g, "&").replace(/\\\//g, "/");
    if (!u.startsWith("http") || seen.has(u)) return;
    seen.add(u);
    out.push({ quality, url: u });
  };
  // url_info JSON 结构
  const urlInfoRe = /"url_info"\s*:\s*\[([^\]]*)\]/s;
  const block = urlInfoRe.exec(html);
  if (block) {
    const itemRe = /"url"\s*:\s*"([^"]+)"[^}]*?"?(?:quality|format|level)"?\s*:\s*"?(\d+)?/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(block[1])) !== null) push(m[2] ? `清晰度${m[2]}` : "标清", m[1]);
  }
  // 直接匹配 mpvideo 地址
  const directRe = /https?:\/\/mpvideo\.qpic\.cn\/[^"'\\\s]+/g;
  let dm: RegExpExecArray | null;
  while ((dm = directRe.exec(html)) !== null) push("默认", dm[0]);
  return out;
}

export async function parseArticle(articleUrl: string): Promise<{ title: string; videos: ParsedArticleVideo[] }> {
  if (!/^https?:\/\/mp\.weixin\.qq\.com\//.test(articleUrl)) {
    throw new Error("仅支持公众号文章链接（mp.weixin.qq.com）");
  }
  const html = await fetchText(articleUrl);
  const titleMatch = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/.exec(html)
    || /<title[^>]*>([^<]+)<\/title>/.exec(html);
  const pageTitle = titleMatch ? decodeEntities(titleMatch[1]).trim() : "公众号文章";
  const vids = extractVidsFromArticle(html);
  const videos: ParsedArticleVideo[] = [];
  for (const vid of vids.slice(0, 5)) {
    try {
      const playerHtml = await fetchText(
        `https://mp.weixin.qq.com/mp/videoplayer?action=get_mp_video_play_url&preview=0&vid=${encodeURIComponent(vid)}&__biz=&mid=&idx=`
      );
      const urls = extractPlayUrls(playerHtml);
      if (urls.length > 0) videos.push({ vid, title: `${pageTitle}（视频${videos.length + 1}）`, urls });
    } catch {
      // 单个 vid 解析失败跳过
    }
  }
  if (videos.length === 0) {
    throw new Error("未能从文章中解析出视频（微信页面结构可能已变化，请改用人工下载后上传）");
  }
  return { title: pageTitle, videos };
}

export async function downloadToFile(url: string, absPath: string): Promise<number> {
  const res = await fetch(url, { headers: { "User-Agent": WX_UA, Referer: "https://mp.weixin.qq.com/" } });
  if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}`);
  const fs = await import("fs");
  const { Writable } = await import("stream");
  const { Readable } = await import("stream");
  const { pipeline } = await import("stream/promises");
  const nodeStream = Readable.fromWeb(res.body as never);
  await pipeline(nodeStream, Writable.toWeb(fs.createWriteStream(absPath)) as never);
  return fs.statSync(absPath).size;
}
