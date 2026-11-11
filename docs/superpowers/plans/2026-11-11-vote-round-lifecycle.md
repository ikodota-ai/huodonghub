# 投票活动与轮次两层状态实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以活动“彩排/正式”控制数据清空与转换，以轮次“待开始/进行中/暂停/已结束”控制提交，完成彩排清场、正式锁定和全入口防绕过。

**Architecture:** 新增无副作用的 `vote-lifecycle` 规则模块，活动转换沿用现有投票 PUT 接口并增加事务校验；所有清分与删除路径统一读取所属活动状态。观众和评委提交在活动结束时阻断，管理界面仅暴露单向生命周期操作，数据库枚举与计分模型不变。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Prisma 5、MySQL 5.7、Node `node:test`、Playwright。

## Global Constraints

- 活动 `draft/active/finished/archived` 分别显示“彩排/正式/已结束/已归档”；轮次状态枚举保持不变。
- 仅彩排活动可清空；正式、已结束、已归档活动禁止所有清分及带数据删除绕过。
- 转为正式前必须无进行中轮次且全活动评分、投票流水均为 0；正式不得退回彩排。
- 已结束/已归档活动禁止提交，历史结果仍可查看；彩排和正式活动仍按轮次状态控制提交。
- 保留配置、名单、二维码口令和绑定；正式后的单个评委仅解除绑定。
- MySQL 5.7、无 Docker、界面全中文、无数据库迁移。
- 不改变计分、批次、配额、限流及 SSE 票账语义。
- 不提交 Git、不创建提交记录、不部署生产，除非用户另行明确要求。

---

### Task 1: 活动生命周期纯规则

**Files:**
- Create: `src/lib/vote-lifecycle.ts`
- Test: `output/vote-lifecycle-tests/lifecycle.test.js`

**Interfaces:**
- Produces: `canClearVoteData(status: string | null | undefined): boolean`
- Produces: `canTransitionVoteStatus(current: string, target: string): boolean`
- Produces: `voteAcceptsSubmissions(status: string | null | undefined): boolean`
- Produces: `voteDataLockedMessage(status: string | null | undefined): string`

- [x] **Step 1: 写失败测试**

```js
test("只有彩排允许清空", () => {
  assert.equal(canClearVoteData("draft"), true);
  for (const status of ["active", "finished", "archived", "pending", null]) {
    assert.equal(canClearVoteData(status), false);
  }
});

test("活动只能单向转换", () => {
  assert.equal(canTransitionVoteStatus("draft", "active"), true);
  assert.equal(canTransitionVoteStatus("active", "finished"), true);
  assert.equal(canTransitionVoteStatus("finished", "archived"), true);
  for (const [current, target] of [["active", "draft"], ["finished", "active"], ["draft", "finished"], ["archived", "draft"]]) {
    assert.equal(canTransitionVoteStatus(current, target), false);
  }
});

test("只有彩排和正式活动可能接受提交", () => {
  assert.equal(voteAcceptsSubmissions("draft"), true);
  assert.equal(voteAcceptsSubmissions("active"), true);
  assert.equal(voteAcceptsSubmissions("finished"), false);
  assert.equal(voteAcceptsSubmissions("archived"), false);
});
```

- [x] **Step 2: 运行确认 RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/vote-lifecycle-tests/lifecycle.test.js`

Expected: 因 `src/lib/vote-lifecycle.ts` 不存在而失败。

- [x] **Step 3: 实现最小纯函数**

```ts
export function canClearVoteData(status: string | null | undefined) {
  return status === "draft";
}

export function canTransitionVoteStatus(current: string, target: string) {
  const transitions: Record<string, string[]> = { draft: ["active"], active: ["finished"], finished: ["archived"], archived: [] };
  return transitions[current]?.includes(target) ?? false;
}

export function voteAcceptsSubmissions(status: string | null | undefined) {
  return status === "draft" || status === "active";
}
```

`voteDataLockedMessage` 对正式、已结束和已归档返回明确中文原因，不泄漏数据库细节。

- [x] **Step 4: 重跑测试确认 GREEN**

### Task 2: 单向活动转换与正式前无数据校验

**Files:**
- Modify: `src/app/api/votes/[id]/route.ts`
- Test: `output/vote-lifecycle-tests/vote-transition.test.js`

**Interfaces:**
- Consumes: `canTransitionVoteStatus()`。
- Existing: `PUT /api/votes/{id}` 接受可选 `status`，但状态变化仅允许 `draft→active→finished→archived`。

- [x] **Step 1: 写路由失败测试**

使用既有路由测试的 Prisma mock 风格覆盖：

```js
test("有进行中轮次时不能转为正式", async () => {
  const response = await putVote({ currentStatus: "draft", targetStatus: "active", roundStatuses: ["active"], scoreCount: 0, voteCount: 0 });
  assert.equal(response.status, 409);
  assert.match(await response.text(), /暂停所有进行中轮次/);
});

test("有彩排流水时不能转为正式", async () => {
  const response = await putVote({ currentStatus: "draft", targetStatus: "active", roundStatuses: ["paused"], scoreCount: 2, voteCount: 3 });
  assert.equal(response.status, 409);
  assert.match(await response.text(), /评分 2 条、投票 3 条/);
});

test("干净彩排可转正式且正式不能退回", async () => {
  const success = await putVote({ currentStatus: "draft", targetStatus: "active", roundStatuses: ["paused"], scoreCount: 0, voteCount: 0 });
  assert.equal(success.status, 200);
  const rejected = await putVote({ currentStatus: "active", targetStatus: "draft", roundStatuses: ["pending"], scoreCount: 0, voteCount: 0 });
  assert.equal(rejected.status, 409);
});
```

同时覆盖 `active→finished`、`finished→archived`、跨级跳转及不修改状态的普通设置保存。

- [x] **Step 2: 运行确认 RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/vote-lifecycle-tests/vote-transition.test.js`

Expected: 旧接口仍允许任意状态跳转，且没有活动级数据检查。

- [x] **Step 3: 实现事务转换**

普通字段保存逻辑不变。仅当 `status` 与当前值不同，在 `db.$transaction` 内重读活动及轮次状态、调用纯转换函数；目标为 `active` 时先拒绝进行中轮次，再统计：

```ts
const [scoreCount, voteCount] = await Promise.all([
  tx.scoreEntry.count({ where: { group: { round: { voteId } } } }),
  tx.voteEntry.count({ where: { group: { round: { voteId } } } }),
]);
```

任一数非零返回 409，错误包含实际条数；计数和更新必须在同一事务，不能使用 `group_stats` 代替流水。

- [x] **Step 4: 重跑 Task 1-2 测试确认 GREEN**

### Task 3: 活动结束提交阻断与清空防绕过

**Files:**
- Modify: `src/app/api/vote/[code]/route.ts`
- Modify: `src/app/vote/[code]/page.tsx`
- Modify: `src/app/api/judge/[token]/route.ts`
- Modify: `src/app/judge/[token]/page.tsx`
- Modify: `src/app/api/console/[roundId]/route.ts`
- Modify: `src/app/api/vote-groups/[id]/reset/route.ts`
- Modify: `src/app/api/voters/[id]/reset/route.ts`
- Modify: `src/app/api/voters/[id]/route.ts`
- Modify: `src/app/api/vote-groups/[id]/route.ts`
- Modify: `src/app/api/rounds/[id]/route.ts`
- Test: `output/vote-lifecycle-tests/submission-guards.test.js`
- Test: `output/vote-lifecycle-tests/reset-guards.test.js`

**Interfaces:**
- Consumes: `canClearVoteData()`、`voteAcceptsSubmissions()`、`voteDataLockedMessage()`。
- `POST /api/voters/{id}/reset` 的 `binding` 模式保持原有行为；`full` 仅在彩排活动执行。

- [x] **Step 1: 写提交与清分失败测试**

提交测试必须证明：

- 彩排 + 进行中轮次、正式 + 进行中轮次均可进入原有提交校验。
- 已结束/已归档 + 进行中轮次返回 403，且不进入写票或评分事务。
- 彩排 + 暂停轮次仍按原规则返回 403，不能把活动彩排误当成轮次开始。

清分测试必须证明：

- 彩排 + 暂停轮次允许整轮清空，删除评分、投票、统计和提交状态但保留绑定。
- 正式 + 待开始/暂停轮次的整轮、群体和单个评委完整清空均返回 409，且不开启删除事务。
- 正式活动的带数据评委、群体、轮次删除返回 409；仅解除绑定只更新 `boundKey/boundAt`。
- 评分规则编辑继续使用 `isRoundDraft()`，不因活动彩排而放开已开始轮次。

- [x] **Step 2: 运行确认 RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/vote-lifecycle-tests/submission-guards.test.js output/vote-lifecycle-tests/reset-guards.test.js`

Expected: 旧代码按轮次 `pending` 判断清分，且活动结束不会覆盖进行中轮次。

- [x] **Step 3: 实现统一服务端规则**

观众 POST 在现有轮次上下文查询中同时读取 `votes.status`，不增加数据库往返；GET 复用已包含的 `round.vote.status`。评委查询补入 `group.round.vote.status`。先判断活动是否接受提交，再执行原轮次状态、时间窗、身份、配额和批次校验。

各清空/删除路由加载所属 `vote.status` 并调用 `canClearVoteData()`。整轮清空事务内容保持不变；正式活动的 `binding` 重置不得触碰评分、投票、`hasVoted` 或 `votedAt`。

- [x] **Step 4: 重跑 Task 1-3 测试确认 GREEN**

### Task 4: 管理界面与公众页状态文案

**Files:**
- Modify: `src/app/admin/(panel)/votes/[id]/page.tsx`
- Modify: `src/app/admin/(panel)/votes/page.tsx`
- Modify: `src/app/admin/(panel)/page.tsx`
- Modify: `src/components/vote/ConsoleTab.tsx`
- Modify: `src/components/vote/RoundsTab.tsx`
- Modify: `src/components/vote/VotersTab.tsx`
- Test: `output/vote-lifecycle-tests/lifecycle.spec.js`

**Interfaces:**
- 活动设置仍保存普通字段；生命周期按钮通过同一 PUT 接口提交目标 `status`。
- 控制台“清空彩排数据”只在 `vote.status === "draft"` 时可用。

- [x] **Step 1: 写浏览器失败场景**

在专用本地活动执行：彩排开始本轮并提交专家/观众数据；暂停后清空；有进行中轮次时转正式被拒；无数据暂停状态转正式成功；开始本轮正式提交；清空入口不可用且接口 409；结束活动后公众页只读。

- [x] **Step 2: 运行场景确认 RED**

Expected: 旧界面仍显示通用状态下拉框、“开始投票”和按轮次状态启用的“清空数据”。

- [x] **Step 3: 实现最小界面变更**

活动状态下拉框替换为当前状态与单向操作按钮；活动标签统一为“彩排/正式”。控制台按钮改为“开始本轮/暂停本轮/结束本轮”和“清空彩排数据”。评审列表以活动状态决定“重置/解除绑定”，删除保护与服务端一致。公众页在活动结束时显示“活动已结束”。

- [x] **Step 4: 重跑浏览器场景确认 GREEN**

确认危险操作继续使用 `useDialogs.confirm`，成功反馈使用现有 `toast`，不引入原生弹窗或新 UI 依赖。

### Task 5: 文档与全量验证

**Files:**
- Modify: `doc/requirements.md`
- Modify: `doc/pages/03-管理后台.md`
- Modify: `doc/pages/05-细分评分.md`
- Modify: `doc/progress.md`
- Modify: `docs/superpowers/plans/2026-11-11-vote-round-lifecycle.md`

- [x] **Step 1: 更新项目规则**

以“活动管数据安全、轮次管现场节奏”替换旧的“仅轮次 pending 可清分”规则，记录单向转换、正式前无数据、结束活动只读和绑定保留边界。

- [x] **Step 2: 运行 Node 全量回归**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/draft-reset-tests/*.test.js output/score-criteria-tests/*.test.js output/performance-tests/*.test.js output/vote-lifecycle-tests/*.test.js`

Expected: 全部通过，失败数 0；既有测试若仍断言旧清空规则，只更新与新设计直接冲突的测试，不修改业务断言来掩盖回归。

- [x] **Step 3: 运行静态检查与构建**

Run: `npx tsc --noEmit && npx prisma validate && npm run lint && BUILD_DIST_DIR=.next-lifecycle npm run build && git diff --check`

Expected: TypeScript、Prisma、构建和 diff 检查通过；ESLint 只允许项目已有 Hook 警告，不新增错误。

- [x] **Step 4: 记录交付边界**

在 `doc/progress.md` 记录实际测试数量、构建结果、浏览器场景与尚未部署状态；明确未提交 Git、未修改生产数据、未执行压力测试。
