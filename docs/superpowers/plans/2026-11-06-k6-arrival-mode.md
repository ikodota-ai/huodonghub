# k6 Arrival Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用受限执行器按恒定到达速率完成指定人数和票数的公网压测。

**Architecture:** 在原 k6 脚本中增加显式到达模式，复用全部请求和校验逻辑。默认模式保持不变，到达模式通过总迭代数和丢迭代数双重验收。

**Tech Stack:** k6 v0.57.0、JavaScript、现有 Node/SSE 核验脚本。

## Global Constraints

- 不修改线上应用和数据库结构。
- 仅使用专用压测活动，禁止写入正式活动。
- 1000 人/20 秒必须产生 1000 次完整迭代、3000 票和 3000 次 SSE 更新。

### Task 1: 到达模式

**Files:**
- Modify: `scripts/load-test/vote.js`
- Modify: `doc/load-test.md`

**Interfaces:**
- Consumes: `LOAD_MODE=arrival`、`MAX_VUS=500`、`USERS=1000`、`DURATION=20s`。
- Produces: k6 `constant-arrival-rate` 场景和原有 `summary.json`。

- [ ] **Step 1: 运行失败验证**

运行 `k6 inspect` 并断言到达模式的 executor 为 `constant-arrival-rate`、maxVUs 为 500。实现前应以实际为 `per-vu-iterations` 而失败。

- [ ] **Step 2: 实现最小改动**

根据 `LOAD_MODE` 选择场景；到达模式跳过启动 sleep，并增加 `dropped_iterations` 和 `iterations` 门槛。默认配置原样保留。

- [ ] **Step 3: 验证配置和兼容性**

到达模式检查 executor、rate、duration、maxVUs；默认模式检查 executor、vus、iterations。随后执行 `k6 inspect` 确认脚本可解析。

- [ ] **Step 4: 执行公网压测**

清理专用活动后，使用 `LOAD_MODE=arrival MAX_VUS=500 USERS=1000 DURATION=20s` 运行本地 k6，并由服务器核验 1000 人、3000 票和资源水位。
