# Score Criteria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让专家和大众等评分群体独立使用整体评分、分值分配或百分制加权，并提供可审计的逐项成绩和双视图评委表单。

**实施状态（2026-11-07）：本地开发、回归与生产构建已完成；尚未部署生产。**

**Architecture:** 新增评分项配置表和逐项成绩表，现有总评分表继续保存服务端合成的百分制总分，现有计数器、均分、群体权重、大屏和聚合不变。纯计分与配置校验独立成无副作用模块，路由负责权限与事务，前端按整体/细分复用同一提交状态。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Prisma 5、MySQL 5.7、Zod、Node `node:test`、Playwright、现有 Tailwind/UI。

## Global Constraints

- 依据已确认的 `docs/superpowers/specs/2026-11-07-score-criteria-design.md` 和 `doc/pages/05-细分评分.md` 实施。
- MySQL 5.7；禁止窗口函数、CTE、CHECK 和 Docker 部署要求。
- 历史群体默认 `single`，观众投票与整体评分提交格式保持兼容。
- 细分群体满分固定 100；逐项首版只接受整数，合成与折算结果保留两位小数。
- 评委端“逐人填写 / 多人同页”只是本地视图偏好，不进入数据库和计分规则。
- 不创建 Git 提交或分支，不部署生产，不修改正式活动数据；测试仅使用本地专用活动。
- 永久测试不加入无测试目录的项目；一次性测试放在已被忽略的 `output/score-criteria-tests/`。

---

### Task 1: 计分内核与数据库结构

**Files:**
- Create: `src/lib/score-criteria.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261107000000_add_score_criteria/migration.sql`
- Test: `output/score-criteria-tests/core.test.js`

**Interfaces:**
- `ScoreMode = "single" | "sum" | "weighted"`
- `CriterionConfig = { id:string; name:string; maxScore:number; weight:number|null; sort:number }`
- `validateCriteria(mode, maxScore, criteria): string | null`
- `computeScoreTotal(mode, criteria, items): number`
- `computeCriteriaContributions(mode, criteria, items): Array<{ criterionId:string; score:number; contribution:number }>`

- [ ] **Step 1: 写失败的核心测试**

```js
test("百分制加权", () => {
  const criteria = [
    { id: "dish-1", name: "第一道菜", maxScore: 100, weight: 50, sort: 1 },
    { id: "dish-2", name: "第二道菜", maxScore: 100, weight: 50, sort: 2 },
  ];
  assert.equal(computeScoreTotal("weighted", criteria, [
    { criterionId: "dish-1", score: 97 },
    { criterionId: "dish-2", score: 99 },
  ]), 98);
});
```

同时覆盖 47+46=93、60%/40%=97.80、比例/满分错误、缺项、多项、重复 ID、跨组 ID、负数、超满分、非整数和 NaN。

- [ ] **Step 2: 运行测试确认 RED**

运行 `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/score-criteria-tests/core.test.js`，预期因 `src/lib/score-criteria.ts` 不存在而失败。

- [ ] **Step 3: 最小实现纯函数与 Prisma 模型**

新增 `vote_groups.score_mode`，默认 `single`；新增 `score_criteria` 与 `score_item_entries`，逐项唯一键为 `(score_entry_id, criterion_id)`，删除总评分时级联明细。计算只返回数据，不访问数据库。

- [ ] **Step 4: 验证核心测试和迁移**

重跑核心测试，随后执行 `npx prisma validate` 和 `npx prisma generate`；备份本地测试库后执行 `npx prisma migrate deploy`，确认 utf8mb4、索引和级联关系，再检查整体评分历史记录仍默认 `single`。

### Task 2: 群体配置、锁定和轮次复制

**Files:**
- Modify: `src/app/api/vote-groups/route.ts`
- Modify: `src/app/api/vote-groups/[id]/route.ts`
- Modify: `src/app/api/rounds/route.ts`
- Modify: `src/app/api/votes/[id]/route.ts`
- Test: `output/score-criteria-tests/group-config.test.js`

**Interfaces:**
- 配置输入增加 `scoreMode` 和 `criteria`，`kind=vote` 时强制 `single` 且无评分项。
- 群体输出增加 `scoreMode`、`criteria`，所有 bigint 继续转字符串。

- [ ] **Step 1: 写失败的路由测试**

验证非法比例合计返回 400；有 `score_entries` 时修改规则返回 409；无成绩时可编辑；复制轮次后评分模式与项目相同但评分项 ID 全部更新；无权限用户仍得到 404。

- [ ] **Step 2: 运行测试确认新字段和锁定尚未实现**

- [ ] **Step 3: 实现事务化配置保存**

在配置写入前查询成绩数量并锁定，保存时替换无成绩评分项；`sum` 校验满分合计 100，`weighted` 校验每项满分 100、比例合计 100。轮次复制在事务中逐组创建新评分项，不复用旧 ID。

- [ ] **Step 4: 重跑配置测试并核对现有字段**

确认 `avgMode/pctMode/voteMode/votePeriod/fixedPoints` 等现有配置没有回归。

### Task 3: 评委读取与原子提交

**Files:**
- Modify: `src/app/api/judge/[token]/route.ts`
- Test: `output/score-criteria-tests/judge-submit.test.js`

**Interfaces:**
- GET 增加 `scoreMode`、`criteria` 和本人已提交 `items`。
- 细分 POST 使用 `scores:[{contestantId, items:[{criterionId, score}]}]`；整体 POST 保持 `{contestantId, score}`。

- [ ] **Step 1: 写失败的提交测试**

使用本地专用活动验证：服务端忽略伪造总分；逐项 97/99 各 50% 写入总评分 98；缺项、跨组项、超分、重复提交均拒绝；人为让第二条明细写入失败时，总评分、明细和计数器全部回滚。

- [ ] **Step 2: 运行测试确认当前路由不接受逐项提交**

- [ ] **Step 3: 实现读取与事务提交**

复用现有 token、绑定、轮次状态、批次和选手范围校验；在一个 Prisma 事务中创建总评分、全部逐项明细并增量更新 `group_stats`。参评人数仍按总评分记录计算。

- [ ] **Step 4: 验证提交、清除和重建**

重跑测试，调用现有评委重置与 `rebuildGroupStats`，确认总评分删除时明细级联、计数器与总分一致。

### Task 4: 后台评分规则编辑器

**Files:**
- Create: `src/components/vote/ScoreCriteriaEditor.tsx`
- Modify: `src/components/vote/RoundsTab.tsx`
- Modify: `src/components/vote/types.ts`
- Test: `output/score-criteria-tests/admin-editor.spec.js`

**Interfaces:**
- 编辑器接收 `mode/maxScore/criteria/disabled` 和 `onChange`，不自行请求 API。
- 试算使用与服务端同一个 `computeScoreTotal`，禁止复制另一套公式。

- [ ] **Step 1: 写失败的浏览器用例**

打开轮次配置，启用专家细分、添加两道菜、选择百分制加权、输入 50/50 和试算 97/99，期望出现 `98.00`；改成 60/40 后出现 `97.80`；合计错误时保存被阻止。

- [ ] **Step 2: 运行 Playwright 确认编辑器尚不存在**

- [ ] **Step 3: 实现编辑器并接入群体卡片**

提供整体/细分、计分模式、2～10 项编辑、排序删除、合计校验、试算和锁定说明。保存失败保留输入，全部确认使用现有 `useDialogs`。

- [ ] **Step 4: 验证两种群体独立配置**

专家配置两道菜，大众配置口味/技法且保留整体或选择另一模式；保存刷新后各自规则不串组，投票群体不出现评分项。

### Task 5: 评委细分表单与双视图

**Files:**
- Create: `src/components/vote/JudgeCriteriaForm.tsx`
- Modify: `src/app/judge/[token]/page.tsx`
- Test: `output/score-criteria-tests/judge-form.spec.js`

**Interfaces:**
- `viewMode: "single" | "list"`，本地键包含评委 token；默认 `single`。
- 两种视图共享同一 `scores/items` 状态和同一提交函数。

- [ ] **Step 1: 写失败的 iPad 与手机用例**

在逐人模式填入第一项，切换多人同页后分数仍在；补齐另一位选手后切回逐人不丢分；刷新后视图偏好保留；切批次后不恢复其他批次分数。

- [ ] **Step 2: 运行 Playwright 确认当前页面无双视图**

- [ ] **Step 3: 实现逐项表单、视图切换和暂存**

逐人模式使用选手导航；多人同页仅展开当前批次全部选手。空白与显式 0 分开记录，未完成定位在逐人模式切换选手、在多人模式滚动高亮。草稿键包含 token、群体、轮次、批次和评分规则签名，规则变化时拒绝恢复。

- [ ] **Step 4: 验证完整提交和异常恢复**

覆盖 iPad 横屏、大众手机竖屏、0 分、未评分、未完整、网络失败重试、提交后只读和防重复提交；整体评分页面保持原行为。

### Task 6: 成绩明细、我的记录与逐项 CSV

**Files:**
- Modify: `src/app/api/results/vote/[id]/contestant/[contestantId]/route.ts`
- Modify: `src/app/api/voters/[id]/records/route.ts`
- Modify: `src/components/vote/ResultsTab.tsx`
- Modify: `src/components/vote/ContestantsTab.tsx`
- Modify: `src/components/vote/VotersTab.tsx`
- Create: `src/app/api/results/round/[id]/score-items/csv/route.ts`
- Test: `output/score-criteria-tests/results.test.js`

**Interfaces:**
- 评分群体增加 `scoreMode/criteria`；逐评委记录增加 `items` 和本人合成总分。
- CSV 每行对应一个评委的一个评分项，BigInt 全部转字符串，保留 BOM。

- [ ] **Step 1: 写失败的结果测试**

核对逐项原始分、比例、贡献、个人总分、参评人数、个人折算、群体平均分和群体折算；整体评分无伪造评分项；投票群体结果不变。

- [ ] **Step 2: 运行测试确认结果中尚无逐项数据**

- [ ] **Step 3: 实现查询、展示和导出**

主成绩表保持简洁，展开后显示评分项汇总和逐评委逐项表；我的记录仅本人可见。正式平均分从合成总分计算，不用展示用的评分项平均分反推。

- [ ] **Step 4: 核对 CSV 与页面及数据库**

同一算例在页面、API、CSV 三处总分与折算完全一致，中文 Excel 打开无乱码。

### Task 7: 文档和完整回归

**Files:**
- Modify: `doc/requirements.md`
- Modify: `doc/data-model.md`
- Modify: `doc/pages/02-投票现场页面.md`
- Modify: `doc/pages/03-管理后台.md`
- Modify: `doc/progress.md`

- [ ] **Step 1: 更新真实数据模型和页面行为**

记录三种模式、双视图、本地暂存、锁定、清除和 CSV 口径；未完成前不得写成已上线。

- [ ] **Step 2: 运行全部回归**

执行全部 `output/score-criteria-tests`、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`git diff --check`。重点回归普通评分、大众投票、观众投票、分批、复制轮次、删除评委、清票、跨轮聚合和大屏 SSE。

- [ ] **Step 3: 本地端到端验收**

分别创建整体、分值分配、百分制加权活动，以专家和大众身份完成评分，确认历史活动结果不变且正式活动未写入测试数据。

- [ ] **Step 4: 给出但不自动执行生产部署步骤**

生产先备份数据库；应用迁移后默认全部 `single`；部署后先用新建测试活动验收三种模式，再由用户决定正式活动启用时间。
