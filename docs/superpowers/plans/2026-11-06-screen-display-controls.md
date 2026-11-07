# Screen Display Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 居中大屏标题，并按轮次增加 Y 轴刻度与柱顶副数值两个显示开关。

**Architecture:** 设置存储于 `vote_rounds`，由控制台 POST 写入，投票详情和大屏 state API 输出；图表页直接消费 state，通过现有 SSE 刷新，不引入新的前端本地配置。

**Tech Stack:** Next.js 14、React 18、Prisma 5.22、MySQL 5.7、ECharts、Playwright CLI。

## Global Constraints

- MySQL 5.7、utf8mb4、无 Docker；新字段默认 1，保持旧活动显示不变。
- 不修改计分、投票、SSE、ECharts 翻页和背景配置逻辑。
- 不新增测试框架，使用真实 API 与 Playwright 做 Red-Green 验收。

### Task 1: 轮次显示字段与接口

**Files:** `prisma/schema.prisma`、`prisma/migrations/20261106000000_add_screen_value_controls/migration.sql`、`src/components/vote/types.ts`、`src/app/api/votes/[id]/route.ts`、`src/app/api/console/[roundId]/route.ts`、`src/app/api/screen/[roundId]/state/route.ts`

- [x] Red：请求 `/api/screen/3/state`，断言 `screenShowAxis === true && screenShowContribution === true`，预期字段缺失失败。
- [x] 实现：增加两个 TinyInt 默认 1 字段；Prisma、RoundItem、投票详情、控制台 0/1 校验与更新、大屏 boolean 输出同步。
- [x] Green：执行 `npx prisma migrate deploy && npx prisma generate`，重跑断言；POST 两个字段为 0 后 GET 均为 false，再恢复 1。

### Task 2: 控制台开关与图表行为

**Files:** `src/components/vote/ConsoleTab.tsx`、`src/app/screen/[roundId]/page.tsx`

- [x] Red：Playwright 在控制台查找“显示Y轴刻度”“显示折算/分数”，预期找不到；大屏根标题仍为单行拼接。
- [x] 实现：增加两个 Toggle；标题改为三行居中；ECharts 根据 `screenShowAxis` 设置 `axisLabel/axisLine/axisTick/splitLine.show` 和左边距，根据 `screenShowContribution` 生成或清空 `sub`。
- [x] Green：分别关闭两个开关，检查 Y 轴元素隐藏、柱顶仅保留名次和主数值；重新开启恢复；总开关关闭仍隐藏全部柱顶数值。

### Task 3: 回归、文档与部署包

**Files:** `doc/progress.md`、`deploy-next-build.tar.gz`

- [x] 实拍 1920×1080 与 2560×1080 的专家、大众、观众和总分页，检查标题居中、无溢出、二维码与群体切换正常。
- [x] 运行 `npx tsc --noEmit`、`npm run lint`、`bash scripts/package-build.sh`，读取新 BUILD_ID。
- [x] 恢复轮次 3 的显示配置，清理 Playwright 产物，更新 `doc/progress.md` 增补 37 并记录 BUILD_ID。
