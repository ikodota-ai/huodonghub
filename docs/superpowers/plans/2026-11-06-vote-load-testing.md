# Vote Load Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可重复执行的完整投票压测工具，并用 50 人冒烟场景验证 2000 人/10 秒、每人 3 票的目标测试流程。

**Architecture:** k6 从站外模拟页面、静态资源、选手加载与每人 3 次写入；Node SSE 监视器复现大屏每次更新后拉取 state 的行为。独立 Prisma CLI 创建专用活动、核对票数、清理数据并恢复 IP 限流，服务器监控脚本记录资源水位。

**Tech Stack:** k6、Node.js 20+、Prisma 5.22、MySQL 5.7、Bash、Next.js SSE。

## Global Constraints

- 目标为 2000 人/10 秒、6000 票；本轮只执行 50 人/10 秒、150 票冒烟，不自动扩大到目标场景。
- 只操作名称以 `压测专用` 开头的活动；禁止清理正式活动数据，禁止新增匿名压测 API。
- 凭据只读现有 `.env`，脚本与报告不得写入数据库密码、Session Cookie 或真实域名。
- 不在应用服务器本机执行公网验收；本机回环结果只作应用/数据库诊断。
- 不自动提交 Git，不同时修改细分评分或计分逻辑。

### Task 1: 专用活动与安全的数据库工具

**Files:** `scripts/load-test/fixture.js`

**Interfaces:**
- `node scripts/load-test/fixture.js create`：创建活动并写 `output/load-test/fixture.json`，保存 vote/round/group/code 和原 `vote.ipLimit`。
- `node scripts/load-test/fixture.js verify --expected-voters 50 --expected-votes 150`：核对测试活动明细、每人 3 票、不重复选手和计数器。
- `node scripts/load-test/fixture.js cleanup`：只删除专用群体的投票流水并重建该群体计数器。
- `node scripts/load-test/fixture.js destroy`：清理并删除专用活动，恢复原 IP 限流。

- [ ] Red：运行 `node scripts/load-test/fixture.js --help`，预期因文件不存在失败。
- [ ] 实现 CLI；`create` 要求显式 `LOAD_TEST_ACK=YES`，创建 12 名选手、开放观众群体（每人 3 票、不可重复、指纹模式）和 active 轮次；元数据不存在时才允许创建。
- [ ] `verify` 通过 vote/round/group 关系复核归属，输出唯一投票人数、总票数、异常用户、重复选手及明细/计数器差额，任一不符 exit 1。
- [ ] `cleanup/destroy` 再次检查活动名前缀与元数据 ID；`destroy` 恢复 settings 原值，原始记录不存在则删除本次新增记录。
- [ ] Green：`node scripts/load-test/fixture.js --help` 输出四个命令；`LOAD_TEST_ACK=YES node ... create` 后验证配置，再 cleanup/destroy 验证无残留。

### Task 2: k6 完整链路与大屏 SSE 监视器

**Files:** `scripts/load-test/vote.js`、`scripts/load-test/sse-watch.mjs`

**Interfaces:**
- k6 环境变量：`BASE_URL`、`VOTE_CODE`、`RUN_ID`、`USERS`、`DURATION`、`SUMMARY_DIR`。
- SSE 环境变量：`BASE_URL`、`ROUND_ID`、`RUN_ID`、`DURATION_SEC`、`OUT_DIR`。

- [ ] Red：`k6 inspect scripts/load-test/vote.js` 与 `node --check scripts/load-test/sse-watch.mjs`，预期文件不存在失败。
- [ ] k6 用 constant-arrival-rate 按 `USERS/DURATION` 启动独立观众；每人使用 `${RUN_ID}-${__VU}-${__ITER}` 指纹，GET HTML、首屏 JS/CSS、API，再顺序 POST 3 个不同选手。
- [ ] 自定义 Counter/Trend 记录业务失败、投票响应、静态资源字节数和完整观众耗时；`handleSummary` 写 `${SUMMARY_DIR}/summary.json`，非预期 4xx/5xx 均使 checks 失败。
- [ ] SSE 监视器解析 `event: update`，每次更新请求 `/api/screen/{roundId}/state`，记录事件数、断线、state 错误和最大/平均延迟，结束写 `sse-summary.json`。
- [ ] Green：`k6 inspect` 与 `node --check` 通过；缺失 `BASE_URL/VOTE_CODE` 时 k6 明确失败，不访问正式活动。

### Task 3: 服务器监控与一键场景执行

**Files:** `scripts/load-test/monitor.sh`、`scripts/load-test/run.sh`、`.gitignore`

**Interfaces:**
- `RUN_ID=smoke USERS=50 DURATION=10s BASE_URL=http://localhost:3000 bash scripts/load-test/run.sh`。
- 服务器另开终端执行 `DURATION_SEC=60 OUT_DIR=/path/to/output bash scripts/load-test/monitor.sh`。

- [ ] Red：`bash -n scripts/load-test/run.sh scripts/load-test/monitor.sh` 预期文件不存在失败。
- [ ] `run.sh` 校验 k6、Node 20+ 和 fixture 元数据，创建 `output/load-test/{RUN_ID}/`，后台启动 SSE 监视器，记录 UTC 开始/结束时间，执行 k6 后调用 fixture verify。
- [ ] `monitor.sh` 每 2 秒记录时间、load average、内存/Swap、PM2 进程 CPU/RSS/重启次数到 `resources.csv`，退出时保留完整文件。
- [ ] `.gitignore` 增加 `/output/`，避免运行报告进入版本库；脚本设置 `set -euo pipefail`，后台任务通过 trap 正常收尾。
- [ ] Green：`bash -n` 通过；缺少元数据或 `USERS` 非正整数时运行失败且不发送请求。

### Task 4: 50 人冒烟、报告与项目记忆

**Files:** `doc/load-test.md`、`doc/progress.md`

- [ ] 安装/确认 k6，创建专用活动；启动本地 SSE 与资源监视后执行 50 人/10 秒、150 票。
- [ ] 核对 HTML/静态资源/API/POST、SSE state、唯一人数、150 条明细、每人 3 票、无重复选手和计数器一致；失败则保留报告并只修复已证实的问题。
- [ ] 冒烟后 cleanup 并确认票数为 0，再 destroy 确认活动删除、IP 限流恢复；产物保留在 `output/load-test/`。
- [ ] `doc/load-test.md` 写明公网目标/余量场景命令、服务器监控、备份、恢复、报告解读和“回环不等于公网验收”。
- [ ] 运行 `node --check`、`bash -n`、Prisma validate 与 `git diff --check`；更新 `doc/progress.md`，记录实测结果和是否允许进入 2000 人目标场景。
