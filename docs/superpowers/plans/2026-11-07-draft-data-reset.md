# Draft Data Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 历史待开始活动可安全切换细分评分，观众群体可单独清空测试票，正式开始后的所有清分路径均被服务端阻止。

**实施状态（2026-11-07）：本地开发、回归与生产构建已完成；尚未部署生产。**

**Architecture:** 以 `vote_rounds.status === "pending"` 作为唯一清分许可，将状态判断集中到无副作用的生命周期模块。新增当前投票群体的重置接口；既有整轮、评委、群体和轮次删除路径复用相同状态规则。前端只负责展示对应入口和锁定原因，服务端负责最终权限与数据保护。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Prisma 5、MySQL 5.7、Node `node:test`、Playwright。

## Global Constraints

- `pending` 才可清分；`active/paused/finished` 一律不可清分。
- 正式开始后允许仅解除设备绑定，不得删除评分、投票或提交状态。
- 保留群体配置、选手、二维码和其他群体数据。
- MySQL 5.7，无 Docker，界面全中文。
- 不提交 Git、不创建分支、不部署生产。

---

### Task 1: 生命周期规则与失败测试

**Files:**
- Create: `src/lib/round-lifecycle.ts`
- Create: `output/draft-reset-tests/lifecycle.test.js`

**Interfaces:**
- Produces: `isRoundDraft(status: string | null | undefined): boolean`
- Produces: `roundDataLockedMessage(status: string | null | undefined): string`

- [ ] **Step 1: 写失败测试**

```js
test("只有待开始允许清分", () => {
  assert.equal(isRoundDraft("pending"), true);
  for (const status of ["active", "paused", "finished"]) assert.equal(isRoundDraft(status), false);
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/draft-reset-tests/lifecycle.test.js`

Expected: 因 `src/lib/round-lifecycle.ts` 尚不存在而失败。

- [ ] **Step 3: 最小实现**

```ts
export function isRoundDraft(status: string | null | undefined) {
  return status === "pending";
}
```

- [ ] **Step 4: 重跑测试确认 GREEN**

### Task 2: 观众群体测试票清空接口

**Files:**
- Create: `src/app/api/vote-groups/[id]/reset/route.ts`
- Modify: `src/app/api/votes/[id]/route.ts`
- Modify: `src/components/vote/types.ts`
- Test: `output/draft-reset-tests/group-reset.test.js`

**Interfaces:**
- Consumes: `isRoundDraft()`、`requireUser()`、`canAccess()`、`voteOwnerByGroup()`。
- Produces: `POST /api/vote-groups/{id}/reset`，成功返回 `{ ok: true, data: true }`。
- Produces: `VoteGroupItem.voteEntryCount: number`。

- [ ] **Step 1: 写接口失败测试**

覆盖：待开始投票群体在一个事务内删除 `voteEntry/groupStat`、重置评委提交状态并保留绑定；评分群体返回 400；`active/paused/finished` 返回 409 且不开启事务。

- [ ] **Step 2: 运行确认 RED**

Expected: 新路由不存在，且详情响应尚无 `voteEntryCount`。

- [ ] **Step 3: 实现最小路由与详情计数**

路由先读取 `group.round.status` 和 `kind`，再执行：

```ts
await db.$transaction([
  db.voteEntry.deleteMany({ where: { groupId } }),
  db.groupStat.deleteMany({ where: { groupId } }),
  db.voter.updateMany({ where: { groupId }, data: { hasVoted: 0, votedAt: null } }),
]);
publish(screenChannel(group.roundId.toString()), "update", { reason: "group_reset" });
```

详情 `_count` 增加 `voteEntries: true`，响应映射 `voteEntryCount: Number(g._count.voteEntries)`。

- [ ] **Step 4: 重跑接口测试确认 GREEN**

### Task 3: 收紧既有清分和评分规则入口

**Files:**
- Modify: `src/app/api/console/[roundId]/route.ts`
- Modify: `src/app/api/voters/[id]/reset/route.ts`
- Modify: `src/app/api/voters/[id]/route.ts`
- Modify: `src/app/api/vote-groups/[id]/route.ts`
- Modify: `src/app/api/rounds/[id]/route.ts`
- Test: `output/draft-reset-tests/guards.test.js`

**Interfaces:**
- `POST /api/voters/{id}/reset` 接收可选 `{ mode: "binding" | "full" }`，默认 `full`。
- 非待开始仅 `binding` 成功；`full` 返回 409。

- [ ] **Step 1: 写失败测试**

覆盖暂停整轮清空返回 409；正式开始后的完整评委重置返回 409；仅解绑只更新 `boundKey/boundAt`；删除有正式成绩的评委、群体或轮次返回 409；无成绩的正式轮次修改评分规则返回 409。

- [ ] **Step 2: 运行确认 RED**

Expected: 旧逻辑仍允许暂停清空、完整重置和规则修改。

- [ ] **Step 3: 实现服务端防线**

所有清分路径先加载所属轮次状态并调用 `isRoundDraft()`。仅解绑使用：

```ts
await db.voter.update({
  where: { id },
  data: { boundKey: null, boundAt: null },
});
```

评分规则变化时同时检查成绩数和轮次状态；删除评委、群体或轮次前检查将被级联删除的评分/投票数量。

- [ ] **Step 4: 重跑全部 Node 测试确认 GREEN**

### Task 4: 后台入口、锁定原因与浏览器验收

**Files:**
- Modify: `src/components/vote/RoundsTab.tsx`
- Modify: `src/components/vote/ScoreCriteriaEditor.tsx`
- Modify: `src/components/vote/ConsoleTab.tsx`
- Modify: `src/components/vote/VotersTab.tsx`
- Test: `output/draft-reset-tests/draft-reset.spec.js`

**Interfaces:**
- 待开始观众群体显示“清空测试票”，调用 `POST /api/vote-groups/{id}/reset`。
- 非待开始评委操作调用 `{ mode: "binding" }`，按钮文案为“解除绑定”。

- [ ] **Step 1: 写浏览器失败用例**

在本地专用活动验证：待开始显示并确认清空测试票；正式开始后入口消失；暂停后整轮清空不可用；评分编辑器显示“轮次已开始，评分规则已锁定”；解除绑定后成绩仍在。

- [ ] **Step 2: 运行确认 RED**

Expected: 找不到“清空测试票”，旧按钮仍允许暂停清空。

- [ ] **Step 3: 实现最小界面**

使用现有 `Button`、`useDialogs.confirm` 和 `toast`，不引入原生 `alert/confirm`。清空成功后把当前群体 `voteEntryCount` 置零并重新加载详情。

- [ ] **Step 4: 重跑浏览器用例及既有细分评分回归**

### Task 5: 文档与最终验证

**Files:**
- Modify: `doc/pages/03-管理后台.md`
- Modify: `doc/pages/05-细分评分.md`
- Modify: `doc/requirements.md`
- Modify: `doc/progress.md`

- [ ] **Step 1: 记录历史活动切换规则和草稿清分边界**
- [ ] **Step 2: 运行 `npx tsc --noEmit`、`npm run lint`、`npx prisma validate`、`git diff --check`**
- [ ] **Step 3: 运行 `BUILD_DIST_DIR=.next-build npm run build`**
- [ ] **Step 4: 明确尚未提交 Git、尚未部署生产**
