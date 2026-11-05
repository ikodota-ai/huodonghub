# Screen Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为投票大屏增加四类内容氛围色、可配置活动主视觉暗化背景与适配超宽 LED 的二维码布局。

**Architecture:** 背景配置属于 `votes`，由投票设置维护并在大屏 state API 输出；大屏前端用统一 Backdrop 叠加主视觉、暗化层和类型光晕，QrMode 使用响应式三栏/紧凑布局。计分、SSE、ECharts 数据与控制逻辑不变。

**Tech Stack:** Next.js 14 App Router、React 18、Tailwind CSS、Prisma 5.22、MySQL 5.7、Playwright CLI。

## Global Constraints

- MySQL 5.7，仅使用兼容 DDL；utf8mb4；无 Docker。
- 不新增测试框架；用真实 API + Playwright 做 Red-Green 验收。
- 类型顺序：第一评分群体专家金、第二评分群体大众紫、投票青蓝、总分酒红金。
- 保留当前视图同步、键盘与控制台逻辑及 ECharts 行为。

---

### Task 1: 投票级主视觉配置

**Files:**
- Create: `prisma/migrations/20261105000000_add_vote_screen_bg/migration.sql`
- Modify: `prisma/schema.prisma`、`src/app/api/votes/[id]/route.ts`、`src/app/api/screen/[roundId]/state/route.ts`、`src/components/vote/types.ts`

**Interfaces:**
- Produces: `screenBgEnabled: boolean`、`screenBgImage: string | null`、`screenBgDim: number`（60–90，默认 78）。

- [ ] **Step 1: Red** — 运行 `curl -s http://localhost:3000/api/screen/3/state | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; assert d["screenBgDim"] == 78'`，预期因字段缺失失败。
- [ ] **Step 2: 实现** — DDL 增加 `screen_bg_enabled` TinyInt 默认 0、`screen_bg_image` VarChar(255) 可空、`screen_bg_dim` Int 默认 78；Prisma 与两个 API、VoteDetail 类型同步；PUT 用 zod 校验 boolean/可空字符串/60–90 整数并保留归属校验。
- [ ] **Step 3: Green** — 执行 migrate + generate 并重启 dev；重跑 Step 1 应通过，再 PUT `screenBgDim=80` 后 GET 应为 80，恢复 78。
- [ ] **Step 4: Commit** — 提交配置链路与迁移。

### Task 2: 投票设置的大屏主视觉控件

**Files:**
- Modify: `src/app/admin/(panel)/votes/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1 的 VoteDetail 三字段与 PUT 字段。

- [ ] **Step 1: Red** — Playwright 打开投票设置，查找文本“大屏主视觉背景”，预期找不到。
- [ ] **Step 2: 实现** — 在手机“主视觉封面”之后增加独立区域：ImagePicker、启用 Toggle、60–90 暗化 range、移除按钮与 LED 分辨率提示；state 随 vote 重置，保存携带三字段。
- [ ] **Step 3: Green** — Playwright 上传一张测试图、开关启用、调暗化到 80 并保存；重开设置断言图片/开关/80 保留，API 同步。
- [ ] **Step 4: Commit** — 提交后台控件。

### Task 3: 四类氛围色与主视觉背景层

**Files:**
- Modify: `src/app/screen/[roundId]/page.tsx`

**Interfaces:**
- Produces: `data-screen-theme="total|expert|public|audience"` 与统一 Backdrop；QrMode/ChartMode 共用 theme。

- [ ] **Step 1: Red** — Playwright 读取大屏根节点 `data-screen-theme`，预期为 null。
- [ ] **Step 2: 实现** — 按 groupId/kind/评分群体序号计算 theme；Backdrop 依次渲染主视觉、暗化层、低透明类型光晕与底部压暗层，无图回退；图表标题增加类型徽标，保留柱子和所有控制。
- [ ] **Step 3: Green** — 四种内容分别断言 data-screen-theme，检查无横向溢出；开启主视觉后背景 img 存在且暗化值正确，关闭后回退。
- [ ] **Step 4: Commit** — 提交背景与标题视觉。

### Task 4: 超宽屏二维码布局与整体验收

**Files:**
- Modify: `src/app/screen/[roundId]/page.tsx`、`doc/progress.md`

**Interfaces:**
- Consumes: Task 3 的 theme/Backdrop。

- [ ] **Step 1: Red** — 2560×1080 打开二维码页，断言存在 `data-qr-layout="wide"`，预期缺失。
- [ ] **Step 2: 实现** — 宽屏三栏（活动信息/白底二维码/扫码步骤），窄屏低高度紧凑居中；二维码正方形且尺寸受视口约束。
- [ ] **Step 3: Green** — 1920×1080 与 2560×1080 实拍四类内容及二维码页；手机投票后仍停当前群体且数值增长；控制台切换正常；tsc、eslint、`scripts/package-build.sh` 全通过。
- [ ] **Step 4: Commit** — 更新 progress.md、提交并推送，记录新 BUILD_ID 供部署核验。
