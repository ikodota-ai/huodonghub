# Next Static OSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Next.js `.next/static` 安全同步到 `https://oss-zonghe.lanaoboxiang.com/huodonghub/_next/static/`，上传与公网验证成功后才切换线上构建，并确保压测继续覆盖绝对 CDN URL。

**Architecture:** 复用媒体迁移脚本的 OSS 配置、MD5/ETag 和并发辅助函数，新增独立 CommonJS 静态同步 CLI。Next 仅在显式 `NEXT_ASSET_PREFIX` 下启用 `assetPrefix`；部署脚本以构建产物中的实际配置和服务器环境双重校验，在 `.next` 原子切换前完成上传与公网探测。

**Tech Stack:** Next.js 14、Node.js 20、ali-oss 6、`@next/env`、Node 内置 `node:test`、Bash、k6。

## Global Constraints

- MySQL 5.7、无 Docker；本功能不新增表、不改变媒体上传、播放、投票或计分逻辑。
- 公网前缀固定为 `https://oss-zonghe.lanaoboxiang.com/huodonghub`，对象仅写入当前项目前缀下 `_next/static/`。
- 不删除旧 OSS 对象，不覆盖同名不同内容对象，不上传符号链接，不打印 AccessKey Secret、数据库 URL 或签名 URL。
- JS/CSS 公网探测必须返回 200、正确 MIME 且无 attachment；任何失败都不得切换旧 `.next`。
- `NEXT_ASSET_PREFIX` 为构建期配置，本地与服务器必须一致；未配置时保持旧行为。
- 压测不得忽略绝对 HTTPS 的 `/_next/static/` 资源。
- 一次性测试放 `output/`，不新增持久测试框架，不新建分支、worktree 或 Git 提交。

## File Map

- Create `scripts/sync-static-to-oss.js`：构建检查、文件扫描、上传复核、公网探测、报告与 CLI。
- Modify `next.config.mjs`：显式构建前缀转 `assetPrefix`。
- Modify `scripts/package-build.sh`、`scripts/deploy.sh`：安全加载构建前缀；服务器构建后先同步再切换。
- Modify `scripts/install-build.sh`：本地构建包解压后先同步再切换。
- Modify `scripts/load-test/vote.js`：收集相对和绝对 Next 静态资源地址。
- Modify `.env.example`、`doc/deployment-baota.md`、`doc/load-test.md`、`doc/progress.md`：配置、部署和验收口径。
- Test `output/static-oss-tests/core.test.js`、`output/static-oss-tests/deploy.test.js`。

---

### Task 1: 构建配置、路径和文件清单

**Files:**
- Create: `scripts/sync-static-to-oss.js`
- Test: `output/static-oss-tests/core.test.js`

**Interfaces:**
- `normalizeAssetPrefix(value): string`
- `loadBuildAssetPrefix(buildDir): string`
- `staticObjectPrefix(storagePrefix, assetPrefix): string`
- `scanStaticFiles(buildDir): Array<{relPath,absPath,size}>`
- `contentType(relPath): string`
- `publicAssetUrl(assetPrefix, relPath): string`

- [x] **Step 1: 写失败测试**：HTTPS/末尾斜杠规范化，拒绝 query/hash、`_next` 误填和非 HTTPS；读取真实 `required-server-files.json` 结构；前缀必须匹配；临时 `.next/static` 扫描忽略符号链接；JS/CSS MIME 和中文/空格/方括号 URL 编码。
- [x] **Step 2: 运行 `node --test output/static-oss-tests/core.test.js`**，预期因同步模块不存在而失败。
- [x] **Step 3: 实现最小纯函数**，复用 `migrate-media-to-oss.js` 的安全路径辅助函数。
- [x] **Step 4: 重跑测试确认通过，并运行 `node --check scripts/sync-static-to-oss.js`**。

### Task 2: 假 OSS 上传复核与公网安全探测

**Files:**
- Modify: `scripts/sync-static-to-oss.js`
- Test: `output/static-oss-tests/core.test.js`

**Interfaces:**
- `runStaticSync({command,buildDir,client,config,envAssetPrefix,fetchImpl,logger,outDir})`
- `probePublicAssets({files,assetPrefix,fetchImpl})`
- CLI：`node scripts/sync-static-to-oss.js [scan|upload|verify] [buildDir]`

- [x] **Step 1: 写失败测试**：本地模式不连接 OSS；构建/环境前缀不一致失败；upload 仅上传缺失对象并设置 MIME/一年 immutable，重跑跳过，冲突不覆盖，verify 不上传；JS/CSS 公网 200 与 MIME 检查，attachment/状态错误失败；报告不含 Secret。
- [x] **Step 2: 运行测试确认新增行为因未实现而失败**。
- [x] **Step 3: 实现 `runStaticSync` 与 CLI**：最多 4 并发，逐文件 MD5/大小复核，失败不写成功结果；`scan` 不初始化 Prisma；上传/复核后才公网探测。
- [x] **Step 4: 重跑全部核心测试和语法检查**。

### Task 3: Next 配置与部署失败保护

**Files:**
- Modify: `next.config.mjs`
- Modify: `scripts/package-build.sh`
- Modify: `scripts/deploy.sh`
- Modify: `scripts/install-build.sh`
- Modify: `.env.example`
- Test: `output/static-oss-tests/deploy.test.js`

**Interfaces:**
- 构建变量 `NEXT_ASSET_PREFIX`；产物断言 `required-server-files.json.config.assetPrefix`。
- 部署顺序：解压/构建 → 数据库迁移 → 静态同步与公网探测 → 切换 `.next` → PM2 重启。

- [x] **Step 1: 写部署失败测试**：临时项目使用假 `node/npx/pm2`，同步失败时旧 `.next` 标记不变且 PM2 不重启；同步成功时才切换并重启。
- [x] **Step 2: 运行测试确认旧 install 脚本在同步阶段不调用 node/测试无法证明保护**。
- [x] **Step 3: 修改 Next 与三个部署脚本**：`@next/env` 只导出目标变量；同步命令位于原子切换之前；`bash -n` 验证。
- [x] **Step 4: 重跑部署测试**，再分别构建无前缀和指定前缀产物，检查 `assetPrefix` 及 HTML 中脚本地址。

### Task 4: 压测采集、文档与交付

**Files:**
- Modify: `scripts/load-test/vote.js`
- Modify: `doc/deployment-baota.md`
- Modify: `doc/load-test.md`
- Modify: `doc/progress.md`

- [x] **Step 1: 更新资源采集**：相对地址保持原行为，绝对 HTTPS 仅接受路径含 `/_next/static/` 的资源；实际 k6 冒烟或受控解析测试证明 CDN URL 被计入 static。
- [x] **Step 2: 文档写明服务器 `.env`、OSS 自定义域名、构建/上传顺序、失败回滚和旧对象清理边界**；不得再声称项目无构建期环境变量。
- [x] **Step 3: 运行最终验证**：全部一次性测试、`npx tsc --noEmit`、`npm run lint`、`bash -n`、指定前缀生产构建、`git diff --check`、敏感信息与部署包内容检查。
- [x] **Step 4: 产出新的 `deploy-next-build.tar.gz`**，记录 BUILD_ID；给出服务器设置环境变量、上传安装、首屏 CDN 验证和 500/20→1000/20→2000/20 压测步骤。未实际执行的生产压测不得宣称通过。
