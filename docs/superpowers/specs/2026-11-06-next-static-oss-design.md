# Next.js 静态资源 OSS 自定义域名卸载设计

日期：2026-11-06

## 目标与证据

将 `.next/static` 的 JS/CSS 等构建资源从 2C4G Node/Nginx 源站卸载到 OSS，降低 1000 人/20 秒压测中静态资源 P95 14.78 秒、HTML P95 22.33 秒的源站压力。媒体继续沿用现有 OSS 驱动；HTML、RSC、投票 API 和 SSE 仍由 Nginx + Node 提供。

用户已配置并批准使用 OSS 自定义域名 `oss-zonghe.lanaoboxiang.com`。2026-11-06 实测 `https://oss-zonghe.lanaoboxiang.com/huodonghub/images/a8564ee9cf2ef13159e67ab4.png` 返回 HTTPS 200、Range 206、正确 `image/png`，没有 `Content-Disposition: attachment` 或 `x-oss-force-download`。

## 方案比较

- **A（采用）：OSS 自定义域名直发**。复用当前 Bucket、前缀和凭证，配置最少；部署前验证公网 MIME 与 inline 行为。
- **B（后续可选）：CDN 回源 OSS**。可进一步改善跨地区访问和缓存命中率，但增加 CDN 域名、证书、缓存与费用配置，本次不引入。
- **C（否决）：仅优化 Nginx 缓存**。能减少重复传输，却无法消除首屏请求仍经过源站 Node/Nginx 和上行带宽的问题。

## URL 与对象布局

构建变量：

```bash
NEXT_ASSET_PREFIX="https://oss-zonghe.lanaoboxiang.com/huodonghub"
```

`next.config.mjs` 去除末尾 `/` 后设置 `assetPrefix`。Next 生成的资源地址为：

```text
https://oss-zonghe.lanaoboxiang.com/huodonghub/_next/static/<原相对路径>
```

服务器同步脚本将 `.next/static/<原相对路径>` 上传到：

```text
huodonghub/_next/static/<原相对路径>
```

URL 路径必须与当前 `storage.config` 的非空对象前缀完全一致，避免误传到 Bucket 根目录或其他项目。变量只允许 HTTPS，不接受 query/hash，也不允许填写到 `_next` 或 `_next/static`。

## 同步与安全

新增 `scripts/sync-static-to-oss.js`，支持 `scan/upload/verify`：

- `scan` 只检查构建配置、文件清单和公网前缀，不连接数据库或 OSS。
- `upload/verify` 从服务器 `settings.storage.config` 读取 OSS 配置，不打印 AccessKey 或 Secret。
- 只递归处理 `.next/static` 普通文件，忽略符号链接；使用现有 MD5/ETag、大小校验和并发辅助函数。
- 已一致文件跳过；同名但大小或 MD5 不同的对象报告冲突，禁止覆盖；上传后重新读取 OSS 元数据。
- JS、CSS 等设置正确 MIME；所有构建静态资源设置 `Cache-Control: public, max-age=31536000, immutable`。Next 文件内容 hash 或 BUILD_ID 已提供版本隔离，脚本不删除旧对象。
- 上传/复核成功后，至少选择一个 JS 和一个 CSS（存在时）通过 `NEXT_ASSET_PREFIX` 公网 GET 探测，要求 200、正确 MIME 且不含 attachment；失败则整个部署失败。
- 报告仅写 `output/static-oss/report.json`，包含 BUILD_ID、脱敏 OSS 信息、文件结果与公网探测，不包含密钥或签名 URL。

## 构建与部署原子性

`NEXT_ASSET_PREFIX` 是**构建期配置**，本地构建机器与服务器 `.env` 必须一致。`package-build.sh` 和 `deploy.sh` 使用 `@next/env` 只导出该变量给构建进程。

同步脚本读取 `.next-build/required-server-files.json` 中的实际 `config.assetPrefix`，与服务器环境比较；不一致时中止，防止“HTML 已引用 CDN 但服务器跳过上传”或配置漂移。

两条部署路径均在切换 `.next` 前执行 `upload`：

1. 本地 `package-build.sh` 构建并打包；服务器 `install-build.sh` 解压、迁移数据库、上传并公网验证静态资源，成功后才替换 `.next` 和重启 PM2。
2. 服务器 `deploy.sh` 影子构建后，同样先上传验证再替换 `.next`。

任一步失败，`set -e` 保留旧 `.next` 和 PM2 进程；旧 OSS 对象不删除，可继续服务旧版本或支持回滚。未配置 `NEXT_ASSET_PREFIX` 的旧构建保持原有本地静态资源行为。

## 压测口径

`scripts/load-test/vote.js` 目前只收集 `/` 开头的资源，启用 `assetPrefix` 后会漏测绝对 HTTPS 地址。必须同步支持同站相对地址和路径包含 `/_next/static/` 的 HTTPS 资源，继续将请求标记为 `static`，不得通过忽略 CDN 资源制造性能提升假象。

部署后按 500/20 → 1000/20 → 2000/20 逐级执行；每档核对静态、HTML、GET、POST、票账与服务器资源，前一档通过才继续。

## 验收

- 未设置前缀时构建仍使用本地 `/_next/static`；设置后 HTML/配置使用指定 HTTPS 前缀。
- 临时构建目录和假 OSS 测试路径映射、MIME、缓存头、断点跳过、冲突拒绝、复核、公网 attachment/MIME 防护与报告脱敏。
- 模拟同步失败时 `install-build.sh` 不切换旧 `.next`；成功时才切换并重启。
- TypeScript、ESLint、生产构建、`bash -n` 和部署包检查通过。
- 生产部署后确认首屏全部 JS/CSS 来自自定义域名且后台/投票页可用，再开始正式阶梯压测。
