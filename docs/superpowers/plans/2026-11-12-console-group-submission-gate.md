# 控制台群体选择与提交权限统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 控制台选中的群体成为唯一可提交群体，“总分”关闭所有提交，页面与直接 API 同步执行。

**Architecture:** 复用现有 `vote_rounds.screen_group_id`，以无副作用规则统一活动、轮次和群体判断。评委 POST 复用已加载关系，观众 POST 在原 SQL JOIN 中限制群体，不增加高频数据库往返；控制台沿用现有 `screen` action 和 SSE。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Prisma 5、MySQL 5.7、Node `node:test`、Playwright。

## Global Constraints

- 仅选中的 `screenGroupId === groupId` 且活动、轮次允许提交时开放；`screenGroupId=null` 表示总分并关闭所有提交。
- 页面与直接 API 均生效；拒绝返回 403，不能产生评分或投票写入。
- 不新增数据库字段或迁移，不改变计分、批次、限流、配额、绑定和生命周期语义。
- 不处理此前暂停的评审二维码绑定漏洞。
- 不使用 worktree；不提交 Git、不部署生产，除非用户另行明确要求。

---

### Task 1: 群体提交纯规则

**Files:**
- Create: `src/lib/group-submission.ts`
- Test: `output/group-submission-tests/rules.test.js`

**Interfaces:**
- Produces: `groupAcceptsSubmissions(input: { voteStatus: string; roundStatus: string; screenGroupId: bigint | string | null | undefined; groupId: bigint | string }): boolean`

- [x] **Step 1: 写失败测试**

```js
test("只有选中的群体可以提交", () => {
  const base = { voteStatus: "active", roundStatus: "active", groupId: 11n };
  assert.equal(groupAcceptsSubmissions({ ...base, screenGroupId: 11n }), true);
  assert.equal(groupAcceptsSubmissions({ ...base, screenGroupId: "11" }), true);
  assert.equal(groupAcceptsSubmissions({ ...base, screenGroupId: 12n }), false);
  assert.equal(groupAcceptsSubmissions({ ...base, screenGroupId: null }), false);
});

test("活动和轮次状态优先关闭提交", () => {
  for (const input of [
    { voteStatus: "finished", roundStatus: "active" },
    { voteStatus: "archived", roundStatus: "active" },
    { voteStatus: "active", roundStatus: "pending" },
    { voteStatus: "active", roundStatus: "paused" },
    { voteStatus: "active", roundStatus: "finished" },
  ]) {
    assert.equal(groupAcceptsSubmissions({ ...input, screenGroupId: 11n, groupId: 11n }), false);
  }
});
```

- [x] **Step 2: 运行测试确认 RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/group-submission-tests/rules.test.js`

Expected: 因 `src/lib/group-submission.ts` 不存在而失败。

- [x] **Step 3: 实现最小纯规则**

```ts
import { voteAcceptsSubmissions } from "./vote-lifecycle";

export function groupAcceptsSubmissions(input: {
  voteStatus: string;
  roundStatus: string;
  screenGroupId: bigint | string | null | undefined;
  groupId: bigint | string;
}): boolean {
  return voteAcceptsSubmissions(input.voteStatus)
    && input.roundStatus === "active"
    && input.screenGroupId !== null
    && input.screenGroupId !== undefined
    && input.screenGroupId.toString() === input.groupId.toString();
}
```

- [x] **Step 4: 重跑测试确认 GREEN**

Run: 同 Step 2。
Expected: 2/2 通过。

### Task 2: 评委页面与提交执行群体门禁

**Files:**
- Modify: `src/app/api/judge/[token]/route.ts`
- Modify: `src/app/judge/[token]/page.tsx`
- Test: `output/group-submission-tests/judge-gate.test.js`

**Interfaces:**
- Consumes: `groupAcceptsSubmissions()`。
- GET 新增 `submissionOpen: boolean`；POST 在未选中当前组时返回 403。

- [x] **Step 1: 写路由失败测试**

```js
test("只开放控制台选中的评委群体", async () => {
  const selected = await postJudge({ screenGroupId: 11n, groupId: 11n });
  assert.equal(selected.response.status, 200);
  const rejected = await postJudge({ screenGroupId: 12n, groupId: 11n });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.calls.some(([name]) => name === "transaction"), false);
});

test("总分关闭评委提交，GET返回未开放", async () => {
  const rejected = await postJudge({ screenGroupId: null, groupId: 11n });
  assert.equal(rejected.response.status, 403);
  const { response, payload } = await getJudge({ screenGroupId: null, groupId: 11n, roundStatus: "active" });
  assert.equal(response.status, 200);
  assert.equal(payload.data.submissionOpen, false);
});
```

- [x] **Step 2: 运行测试确认 RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/group-submission-tests/judge-gate.test.js`

Expected: 旧 POST 仍写入或仍返回原状态，GET 缺少 `submissionOpen`。

- [x] **Step 3: 实现 GET/POST 与页面状态**

GET 返回：

```ts
submissionOpen: groupAcceptsSubmissions({
  voteStatus: round.vote.status,
  roundStatus: round.status,
  screenGroupId: round.screenGroupId,
  groupId: group.id,
}),
```

POST 在活动和轮次状态检查之后、任何重复查询和写事务之前执行同一判断；不匹配返回 `fail("当前未开放本群体评分/投票", 403)`。页面类型补充 `submissionOpen`，在活动结束和历史回显分支之后、轮次状态分支之前，对 `roundStatus === "active" && !submissionOpen` 显示只读提示。

- [x] **Step 4: 重跑测试确认 GREEN**

Run: 同 Step 2，并运行 `npx tsc --noEmit`。
Expected: 路由测试通过，类型检查通过。

### Task 3: 观众 GET/POST 与压测 fixture 执行群体门禁

**Files:**
- Modify: `src/app/api/vote/[code]/route.ts`
- Modify: `scripts/load-test/fixture.js`
- Test: `output/group-submission-tests/audience-gate.test.js`
- Test: `output/group-submission-tests/fixture-gate.test.js`

**Interfaces:**
- 观众 GET 只在选中开放观众组时返回可投 `group` 和 `phase=active`。
- 观众 POST SQL 继续单次查询，JOIN 增加 `g.id = r.screen_group_id`。

- [x] **Step 1: 写失败测试**

```js
test("只有控制台选中的开放观众组可以投票", async () => {
  const selected = await postAudience({ screenGroupId: 11n, groupId: 11n });
  assert.equal(selected.response.status, 200);
  for (const screenGroupId of [12n, null]) {
    const rejected = await postAudience({ screenGroupId, groupId: 11n });
    assert.equal(rejected.response.status, 403);
    assert.equal(rejected.calls.some(([name]) => name === "transaction"), false);
  }
});

test("压测fixture把观众组设为当前开放组", () => {
  assert.match(fixtureSource, /screenGroupId:\s*group\.id/);
});
```

- [x] **Step 2: 运行测试确认 RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/group-submission-tests/audience-gate.test.js output/group-submission-tests/fixture-gate.test.js`

Expected: 旧 POST 未按选中组限制，fixture 未设置 `screenGroupId`。

- [x] **Step 3: 实现最小修改**

观众 GET 将 `round.groups[0]` 改为：

```ts
const group = round.groups.find((item) => item.id === round.screenGroupId) ?? null;
const phase = roundPhase(round);
```

返回的 `phase` 在 `phase === "active" && !group` 时使用 `paused`，其他状态保持原值。POST 原 JOIN 追加：

```sql
AND g.id = r.screen_group_id
```

fixture 在取得 `round` 和 `group` 后、写入元数据前执行：

```js
await db.voteRound.update({ where: { id: round.id }, data: { screenGroupId: group.id } });
```

- [x] **Step 4: 重跑测试确认 GREEN**

Run: 同 Step 2。
Expected: 选中组通过，其他组与总分 403，拒绝时无事务；fixture 断言通过。

### Task 4: 控制台提示、跨群体浏览器场景与文档

**Files:**
- Modify: `src/components/vote/ConsoleTab.tsx`
- Modify: `output/vote-lifecycle-tests/lifecycle.spec.js`
- Modify: `output/draft-reset-tests/draft-reset.spec.js`
- Test: `output/group-submission-tests/group-gate.spec.js`
- Modify: `doc/requirements.md`
- Modify: `doc/pages/02-投票现场页面.md`
- Modify: `doc/pages/03-管理后台.md`
- Modify: `doc/data-model.md`
- Modify: `doc/load-test.md`
- Modify: `doc/progress.md`

**Interfaces:**
- 控制台继续提交 `action:"screen", screenGroupId`，不新增 API。

- [x] **Step 1: 写浏览器失败场景**

创建含专家、大众、开放观众组的本地专用活动，分别验证：选专家仅专家 POST 200；选大众仅大众 POST 200；选观众仅观众 POST 200；选总分三者均 403。观众页和未选中评委页显示未开放，所有被拒绝请求无流水。

- [x] **Step 2: 运行场景确认 RED**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" output/score-criteria-tests/node_modules/.bin/playwright test --config=output/group-submission-tests/playwright.config.js`

Expected: 旧控制台切换只改变展示，未选中群体仍能提交。

- [x] **Step 3: 更新控制台与旧测试**

将“大屏显示内容”改为“当前开放群体（同步大屏显示）”，总分显示为“总分（关闭所有提交）”，补充切换立即影响页面和 API 的中文提示。旧生命周期测试在专家/观众提交前通过 console API 选择相应群体，保持原断言不变。

- [x] **Step 4: 运行完整验证**

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node --test output/draft-reset-tests/*.test.js output/score-criteria-tests/*.test.js output/performance-tests/*.test.js output/vote-lifecycle-tests/*.test.js output/group-submission-tests/*.test.js
npx tsc --noEmit
npx prisma validate
npm run lint
BUILD_DIST_DIR=.next-group-gate npm run build
git diff --check
```

并运行新群体场景及既有生命周期、清空/解绑浏览器场景。Expected: 全部通过，ESLint 只允许既有 Hook 警告；构建后移走影子目录并还原 Next 对 `tsconfig.json` 的自动修改。

- [x] **Step 5: 更新文档和交付边界**

明确 `screenGroupId` 同时控制展示和提交、总分全部关闭；记录测试数量、构建结果和未部署状态。不得把评审绑定漏洞标记为已修复。
