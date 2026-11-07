# Dashboard OSS Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理员仪表盘异步展示当前 OSS 对象前缀的只读健康状态、对象数量、容量和本地媒体残留，并提供手动刷新。

**Architecture:** 新增独立的服务端存储用量模块，将 OSS 分页、异常分类、本地文件扫描和 10 分钟缓存封装为可注入依赖的读取器。新增仅管理员可访问的查询 API；仪表盘通过独立客户端卡片加载，不影响原有统计与健康提醒。依据已批准的 `docs/superpowers/specs/2026-11-06-dashboard-oss-usage-design.md` 实施。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、ali-oss 6、Node.js 内置 `node:test`、现有 Tailwind/UI 组件。

## Global Constraints

- MySQL 5.7；本功能不新增表、不执行数据库写入、不使用 Docker。
- 仅统计当前配置的非空对象前缀；不得调用 Bucket 总用量接口或退化为统计整个 Bucket。
- OSS 查询只读，分页使用 `max-keys=1000` 与 `nextMarker`，并防止重复 Marker 死循环。
- 不返回或记录 AccessKey、Secret、数据库 URL、签名 URL、原始 OSS 错误报文或其他前缀对象清单。
- 本地仅统计 `images/covers/videos` 普通文件，忽略符号链接，不包含 `tmp/backups`。
- API 仅 `admin` 可访问；维护人员与编辑不显示该卡片。
- 10 分钟进程内缓存，缓存键为驱动、Region、Bucket、前缀；`refresh=1` 绕过缓存，失败不缓存。
- 不修改上传、迁移、媒体播放、投票计分逻辑；不添加持久测试框架；一次性测试放 `output/`。
- 保留当前工作区已有修改，不新建分支、worktree 或 Git 提交。

## File Map

- Create `src/lib/storage-usage.ts`：OSS 分页统计、错误分类、本地扫描、缓存读取器及安全返回类型。
- Create `src/app/api/settings/storage/usage/route.ts`：管理员鉴权、读取配置、解析 `refresh`、返回用量。
- Create `src/components/admin/StorageUsageCard.tsx`：异步卡片、状态徽标、用量明细、失败提示与刷新。
- Modify `src/app/api/dashboard/route.ts`：仅增加 `showStorageUsage` 管理员可见标记。
- Modify `src/app/admin/(panel)/page.tsx`：按标记挂载独立存储卡片，原仪表盘加载路径不变。
- Modify `doc/pages/03-管理后台.md`、`doc/progress.md`：记录功能口径、部署和验证结果。
- Test `output/storage-usage-tests/core.test.js`：一次性 Node 测试，使用假 OSS 和临时目录，不连接生产 OSS。

---

### Task 1: OSS 分页、异常分类和本地残留

**Files:**
- Create: `src/lib/storage-usage.ts`
- Test: `output/storage-usage-tests/core.test.js`

**Interfaces:**
- `collectOssPrefixUsage(client, prefix): Promise<{ objects:number; bytes:number; pages:number }>`
- `scanLocalMedia(mediaRoot): { files:number; bytes:number }`
- `classifyOssError(error): { status:"permission_denied"|"unreachable"; message:string }`
- `OssListClient.list(query, options): Promise<{ objects:Array<{name:string;size:number}>; isTruncated:boolean; nextMarker:string|null }>`

- [x] **Step 1: 写失败测试**：两页结果混入其他前缀对象，验证只累计目标前缀、目录标记计入对象数、分页 Marker 正确；重复/缺失 Marker 必须终止；权限与网络异常映射为安全中文；临时目录验证三类文件、符号链接与 `tmp/backups` 排除规则。
- [x] **Step 2: 运行 `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/storage-usage-tests/core.test.js`**，预期因生产模块不存在而失败。
- [x] **Step 3: 最小实现纯统计函数**：不依赖数据库和 Next.js；默认 OSS 客户端延迟加载；所有远程异常只映射为固定安全文案。
- [x] **Step 4: 重跑同一测试**，预期全部通过。

### Task 2: 配置状态与 10 分钟缓存

**Files:**
- Modify: `src/lib/storage-usage.ts`
- Test: `output/storage-usage-tests/core.test.js`

**Interfaces:**
- `createStorageUsageReader(dependencies?)`：返回隔离缓存的 `read(config, { refresh? })`。
- `readStorageUsage(config, options?)`：生产单例读取器。
- 返回 `driver`、脱敏 `oss`、`remote.status/objects/bytes/checkedAt/durationMs/message`、`local`、`cached`。

- [x] **Step 1: 写失败测试**：本地驱动不创建 OSS 客户端；缺 Region/Bucket/凭证或空前缀不请求远程；首次成功、10 分钟内命中、手动刷新、前缀变化、恰好过期分别验证调用次数；权限/网络失败不缓存；序列化结果不包含 Secret。
- [x] **Step 2: 运行测试确认新增用例失败**，失败原因必须是缓存/配置状态尚未实现。
- [x] **Step 3: 实现读取器**：成功结果缓存 600000ms；命中结果标记 `cached=true`；配置缺失、本地模式和远程失败均返回可展示状态且不写成功缓存。
- [x] **Step 4: 重跑全部核心测试**，预期全部通过。

### Task 3: 管理员 API 与异步仪表盘

**Files:**
- Create: `src/app/api/settings/storage/usage/route.ts`
- Create: `src/components/admin/StorageUsageCard.tsx`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/admin/(panel)/page.tsx`

**Interfaces:**
- `GET /api/settings/storage/usage?refresh=1`：401 未登录、403 非管理员、200 返回 `ok(data)`。
- `/api/dashboard` 新增 `showStorageUsage:boolean`，仅 `admin` 为 true。
- 卡片按钮统一命名为“刷新”，加载时禁用并显示“统计中…”。

- [x] **Step 1: 在独立路由测试中调用真实 `GET` 处理函数**：仅替换鉴权、配置和 OSS 外部边界，验证未登录 401、非管理员 403、管理员 200 与 `refresh=1` 传递。
- [x] **Step 2: 运行测试确认路由不存在而失败**，随后实现最小 API；路由不得把原始异常透给客户端。
- [x] **Step 3: 实现卡片并接入仪表盘**：原 `/api/dashboard` 独立加载；卡片自行处理首次加载、正常、本地、未配置、权限失败、网络失败和刷新失败，不让异常替换整个仪表盘。
- [x] **Step 4: 运行核心测试和 `npx tsc --noEmit`**，验证接口与 JSX 类型。
- [x] **Step 5: 浏览器或 HTTP 验证权限和卡片状态**：未登录 401、非管理员 403、管理员 200；页面异步出现卡片且原统计立即可用。

### Task 4: 文档与完整验证

**Files:**
- Modify: `doc/pages/03-管理后台.md`
- Modify: `doc/progress.md`

- [x] **Step 1: 更新后台页面文档**：写明“本项目前缀用量，非整个 Bucket、非账单”，缓存、本地残留和权限口径。
- [x] **Step 2: 更新 `doc/progress.md`**：记录真实测试与构建结果；视频仍走本地的问题保持独立待查，不因本卡片完成而宣称迁移播放问题已解决。
- [x] **Step 3: 运行最终验证**：全部一次性测试、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`git diff --check`；检查最终 diff 不含凭证、数据库文件、媒体或临时测试。
- [x] **Step 4: 给出服务器最小更新步骤**：拉取本次涉及文件、安装既有依赖（无新增则无需安装）、构建/PM2 重启、管理员打开仪表盘并点击刷新；生产对象数必须以真实接口输出为准。
