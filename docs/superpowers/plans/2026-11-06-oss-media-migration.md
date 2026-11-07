# OSS Media Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供一个在服务器读取现有 OSS 配置、上传并逐项校验已有图片/封面/视频的安全迁移工具，上传期间绝不删除本地文件。

**Architecture:** 单文件 CommonJS CLI 复用项目 Prisma 与 ali-oss；纯文件系统/校验函数导出供临时测试调用。`scan/upload/verify` 共用同一份文件清单与远程元数据比较逻辑，只有 `upload` 能在远程不存在时写入。

**Tech Stack:** Node.js 20+、Prisma 5、ali-oss 6、Node 内置 `node:test`、MySQL `settings.storage.config`。

## Global Constraints

- 仅处理 `images/`、`covers/`、`videos/` 普通文件，排除 `tmp/backups` 与符号链接。
- 不打印 AccessKey Secret、数据库 URL、签名 URL；报告只记录 Region、Bucket、前缀和相对路径。
- 对象键为 `huodonghub/原相对路径`（前缀由配置读取），拒绝前导 `/` 和 `..`。
- 同名远程对象校验不一致时报告冲突，禁止覆盖；上传后必须重新读取 OSS 元数据。
- 本地激活与回滚由人工单独执行，脚本不得删除或移动本地文件。
- 不修改 Next.js 静态资源、数据库结构和计分逻辑；不创建 Git 提交或分支。

---

### Task 1: 文件清单、路径和远程校验

**Files:**
- Create: `scripts/migrate-media-to-oss.js`
- Test: `output/oss-migration-tests/core.test.js`（本地一次性测试，不进入版本库）

**Interfaces:**
- `normalizePrefix(value: string): string`
- `scanFiles(mediaRoot: string): Array<{ relPath:string, absPath:string, size:number }>`
- `objectKey(prefix: string, relPath: string): string`
- `md5File(absPath: string): Promise<string>`
- `remoteMetadata(client, key): Promise<null | { size:number, etag:string }>`
- `compareRemote(client, file, prefix): Promise<{ status:string, reason?:string }>`

- [ ] **Step 1: 写失败测试**：用临时 `images/covers/videos/tmp/backups` 文件树验证只扫描三类文件；验证 `huodonghub` 规范为 `huodonghub/`、拒绝 `/cdbs` 与 `../x/`；验证对象键、MD5、缺失/大小不符/MD5 不符/一致五种远程比较结果。
- [ ] **Step 2: 运行 `node --test output/oss-migration-tests/core.test.js`**，预期因 `scripts/migrate-media-to-oss.js` 不存在而失败。
- [ ] **Step 3: 实现上述纯函数**：递归扫描普通文件；`getObjectMeta` 404 返回 null；简单 ETag 对比本地 MD5，分片 ETag 至少核对大小。
- [ ] **Step 4: 重跑同一测试**，预期全部通过；运行 `node --check scripts/migrate-media-to-oss.js`。

### Task 2: 配置读取、断点上传、完整复核与报告

**Files:**
- Modify: `scripts/migrate-media-to-oss.js`
- Test: `output/oss-migration-tests/cli.test.js`（本地一次性测试，不进入版本库）

**Interfaces:**
- `loadStorageConfig(db): Promise<StorageConfig>`：读取 `settings.storage.config`，无记录时回退 `OSS_*` 环境变量。
- `mapLimit(items, 2, worker)`：最多两个并发并保持报告顺序。
- `runMigration({ command, mediaRoot, client, files, prefix, outDir })`：执行上传或校验并写 `report.json`。

- [ ] **Step 1: 写失败测试**：假 OSS 客户端模拟空 Bucket，断言 upload 只上传缺失文件、重跑跳过一致文件、冲突不覆盖、verify 不上传、失败时退出结果失败；序列化报告后断言不包含 Secret 和数据库密码。
- [ ] **Step 2: 运行 `node --test output/oss-migration-tests/cli.test.js`**，预期因导出函数不存在而失败。
- [ ] **Step 3: 实现 CLI**：校验 `driver=oss` 和凭证完整；`scan` 只统计；`upload` 对缺失对象 `put` 后复核；`verify` 全量复核；任何失败设置退出码 1；最后断开 Prisma。
- [ ] **Step 4: 重跑两组测试与语法检查**，预期全部通过。

### Task 3: 服务器操作手册与交付验证

**Files:**
- Modify: `doc/deployment-baota.md`
- Modify: `doc/progress.md`
- Create: `output/oss-migration-deploy.tar.gz`

**Interfaces:**
- 服务器命令：`scan → upload → verify → 人工 activate → 公网媒体抽查`。

- [ ] **Step 1: 文档写明三段操作**：在线扫描/上传/校验；确认 `failed=0` 后停 PM2 并将三个目录移到项目外备份；异常时恢复目录回滚。
- [ ] **Step 2: 运行全部一次性测试、`node --check`、`git diff --check`**，检查脚本和报告模板不包含真实凭证。
- [ ] **Step 3: 生成只包含迁移脚本的 `output/oss-migration-deploy.tar.gz`**，避免覆盖服务器现有备份脚本；确认不含 `.env/media/node_modules/.next`。
- [ ] **Step 4: 用户上传并在服务器运行 scan/upload/verify**；本代理只在看到真实输出后声称迁移成功， activate 后另行抽查公开媒体 302→200 和 Range。
