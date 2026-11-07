# 投票压力测试手册

## 目标与边界

目标场景为 **2000 名观众在 10 秒内打开页面，并每人投 3 票**，即约 200 人/秒、600 次投票写入/秒。先执行 50 人冒烟和 200 人基准，目标通过后才执行 3000 人余量测试。

公网验收必须从应用服务器之外发起。服务器回环结果只能诊断 Node/MySQL 容量，不能证明真实域名、公网带宽和 Nginx 能满足现场需求。

## 工具

- `scripts/load-test/fixture.js`：创建、核对、清理、销毁专用活动，并安全恢复 IP 限流。
- `scripts/load-test/vote.js`：k6 完整观众链路，不执行自动重试。
- `scripts/load-test/sse-watch.mjs`：保持大屏 SSE，并在每次 update 后请求 state，复现大屏真实行为。
- `scripts/load-test/run.sh`：一键执行一个独立场景并保存报告。
- `scripts/load-test/monitor.sh`：每 2 秒记录服务器或本机资源。

## 前置检查

1. 确认压测机安装 k6：`k6 version`。
2. SSE 监视器需要 Node.js 20+；默认 `node` 版本较低时，用 `NODE_BIN=/path/to/node` 指定。
3. 在服务器执行 `bash scripts/backup.sh`，确认备份文件生成。
4. 不在正式投票活动期间压测，不使用现有正式活动作为测试目标。
5. 公网压测时保持一个大屏页和一个后台控制台在线，观察断线、刷新延迟与页面跳变。

## 创建专用活动

在应用项目根目录执行：

```bash
LOAD_TEST_ACK=YES node scripts/load-test/fixture.js create
```

该命令创建 12 名压测选手和“每人 3 票、不可重复投同一人”的开放观众轮次，并写入 `output/load-test/fixture.json`。它会临时调高 `vote.ipLimit`，但投票接口仍执行原有 IP 统计查询。

元数据已存在时会拒绝重复创建，防止覆盖上一场尚未清理的测试。

## 执行场景

### 50 人冒烟

```bash
RUN_ID=smoke-001 USERS=50 DURATION=10s BASE_URL=http://localhost:3000 \
  NODE_BIN=/path/to/node20+ bash scripts/load-test/run.sh
```

另开终端记录资源（公网测试时在应用服务器执行）：

```bash
DURATION_SEC=60 OUT_DIR=output/load-test/smoke-001-monitor \
  bash scripts/load-test/monitor.sh
```

### 200 人基准

```bash
RUN_ID=baseline-001 USERS=200 DURATION=10s BASE_URL=https://你的域名 \
  NODE_BIN=/path/to/node20+ bash scripts/load-test/run.sh
```

### 2000 人目标

只有前一场景的票数、性能与服务器水位均通过后才执行：

```bash
RUN_ID=target-001 USERS=2000 DURATION=10s BASE_URL=https://你的域名 \
  NODE_BIN=/path/to/node20+ bash scripts/load-test/run.sh
```

### 3000 人余量

目标场景通过后，将 `USERS` 改为 3000，并使用新的 `RUN_ID`。不要在目标场景失败后直接扩大压力。

## 核对与清理

每次 `run.sh` 都会自动核对票数，也可以手动执行：

```bash
node scripts/load-test/fixture.js verify --expected-voters 2000 --expected-votes 6000
```

下一场景前清空专用活动测试票：

```bash
node scripts/load-test/fixture.js cleanup
node scripts/load-test/fixture.js verify
```

全部结束后删除专用活动并恢复限流：

```bash
node scripts/load-test/fixture.js destroy
```

`destroy` 如果发现 `vote.ipLimit` 被其他操作修改，会停止销毁，避免覆盖他人配置。此时必须人工核对，不要强行覆盖。

## 报告解读

每个场景写入 `output/load-test/{RUN_ID}/`：

- `summary.json`：k6 请求、P95/P99、失败率、业务检查和吞吐量。
- `k6.log`：k6 控制台报告及被丢弃的迭代（若有）。
- `verify.json`：唯一观众、总票数、每人 3 票、不重复选手、计数器一致性与 MySQL 状态。
- `sse-summary.json`：SSE 连接、更新数、state 并发峰值、错误和延迟。
- `run.json`：k6/SSE/数据库核对三个退出状态。

目标验收：非预期 5xx 和业务错误为 0；GET/POST P95 ≤1 秒、P99 ≤2 秒；目标场景 2000 人、6000 票完整一致；无 OOM、PM2 异常重启或 MySQL 连接耗尽；高峰结束后大屏 2 秒内显示最终结果。

如果公网带宽先打满，应将其报告为网络瓶颈，不能改用回环数据宣布公网验收通过。

## 本机高人数恒定到达模式

macOS 运行 1000 个网络请求型 VU 可能触发 `failed to create new OS thread`。显式设置 `LOAD_MODE=arrival` 后，脚本使用 `constant-arrival-rate`：`USERS=1000 DURATION=20s MAX_VUS=500` 表示每秒到达 50 人、最多复用 500 个执行器，总人数仍为 1000、总票数仍为 3000。`dropped_iterations` 必须为 0 且完整迭代数必须等于 `USERS`，否则本轮无效，不能把压测端容量不足冒充为验收通过。

到达模式不再额外执行按 VU 编号计算的启动 sleep，因此 `audience_total_duration` 是实际操作耗时，不能与默认 `per-vu-iterations` 模式中含启动等待的总耗时直接比较。未设置 `LOAD_MODE` 时，默认行为不变。

```bash
LOAD_MODE=arrival MAX_VUS=500 \
RUN_ID=oss-1000-arrival USERS=1000 DURATION=20s \
VOTE_CODE=专用活动代码 ROUND_ID=专用轮次ID \
BASE_URL=https://cdbs.lanaoboxiang.com \
bash output/load-test/run-remote-full.sh
```

## 2026-11-06 公网只读实测

用户提供的公网地址为正式活动大屏 `https://cdbs.lanaoboxiang.com/screen/1`，其中已有真实评分和投票。为遵守“不使用正式活动作为写入压测目标”的约束，本轮只请求大屏 HTML、首屏 JS/CSS、`/api/screen/1/state`，并保持一个 SSE 连接；没有调用投票 POST，也没有创建 2000 个不符合真实现场的 SSE 连接。

| 场景 | 完整迭代 | 请求数 | 请求失败 | HTML P95 | 静态资源 P95 | state P95 | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 50 人 / 10 秒启动 | 50 | 450 | 0 | 255ms | 330ms | 76ms | 通过 |
| 200 人 / 10 秒启动 | 200 | 1800 | 0 | 574ms | 3.82s | 216ms | 通过，静态资源开始变慢 |
| 500 人 / 10 秒启动 | 500 | 4500 | 0 | 2.69s | 24.81s | 720ms | **未通过 HTML P95 ≤1s 门槛** |

500 人场景传输约 244MB，平均接收速率约 53Mbps，瓶颈首先表现为 HTML/静态资源传输变慢；仅凭压测端数据不能断定是服务器出口还是压测机下行带宽，需要服务器端资源监控和带宽数据配合定位。SSE 在 500 人场景仍持续收到 ping，结束后 state 单请求约 176ms。

由于 500 人档位已未通过，本轮没有继续执行 2000 人档位，也没有把“零请求失败”误报为性能验收通过。正式活动观众参与人数压测前后均为 9，各选手真实票数未变。

本轮只是**公网大屏只读诊断**，不等于“2000 人打开观众页并投 6000 票”的完整验收。完整公网验收仍需先部署包含本轮查询优化的版本，在服务器创建 `压测专用` 活动，再执行 50 → 200 → 2000 的完整观众链路，同时记录 PM2、MySQL、Nginx 和带宽水位。

## 2026-11-06 公网完整投票链路实测

使用服务器上的独立 `压测专用` 活动，从应用服务器之外执行完整观众链路：打开投票 HTML、下载首屏 JS/CSS、GET 选手与配额、顺序 POST 3 个不同选手，同时保持一个真实 SSE 大屏连接。每场均先检查上一轮已清零；正式活动未写入测试票。

| 场景 | 请求/业务失败 | GET P95 | POST P95 | HTML P95 | 静态 P95 | 完整操作 P95 | SSE 更新 | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 50 人 / 10 秒 | 0 | 68ms | 88ms | 305ms | 1.05s | 1.93s | 150/150 | 通过，数据库 50/150 核对一致 |
| 200 人 / 10 秒（复核） | 0 | 125ms | 153ms | 647ms | 3.94s | 5.90s | 600/600 | 通过，数据库 200/600 核对一致 |
| 500 人 / 10 秒 | 0 | 562ms | 483ms | 16.41s | 9.41s | 25.74s | 1500/1500 | 核心 API 通过，页面体验不满足 10 秒目标 |
| 500 人 / 20 秒 | 0 | 573ms | 853ms | 3.77s | 14.78s | 20.41s | 1500/1500 | 核心 API 通过，POST 接近门槛，静态仍是瓶颈 |
| 1000 人 / 20 秒 | 0 | 1.323s | 2.244s | 22.33s | 31.89s | 59.47s | 3000/3000 | **未通过 GET/POST 性能门槛，停止升档** |

1000 人场景最终公网状态为 1000 个独立观众、3000 票，SSE 无断线且 state 最大在途请求为 1；但响应时间已超过门槛，不能用“票最终都正确”替代性能验收。2000 人/20 秒未执行，更未通过。

### 服务器资源水位

| 场景 | 峰值 load | Node CPU 峰值 | 最低可用内存 | Node 最大 RSS | Swap 峰值 | PM2 重启 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 200 人 / 10 秒 | 1.62 | 86.9% | 2363MB | 146MB | 342MB | 3（压测前后不变） |
| 500 人 / 20 秒 | 1.74 | 109.5% | 2258MB | 164MB | 335MB | 3（压测前后不变） |
| 1000 人 / 20 秒 | 2.88 | 100.0% | 2113MB | 197MB | 335MB | 3（压测前后不变） |

2C4G 服务器的内存始终充足，无 OOM、无新增重启；1000 人时 load 超过 2 核容量，单 Node CPU 达到一个核的满载水平，同时公网 HTML/静态资源显著排队。当前优先优化顺序：

1. `.next/static` 使用 OSS 自定义域名/`assetPrefix` 的部署链路已实现，选手照片和主视觉已走 OSS 媒体存储；待生产启用后复测。压测脚本已支持绝对 HTTPS 的 `/_next/static/` 地址，不得用忽略 CDN 资源的方式制造提升假象。
2. 保留 MySQL 同步票账，不在投票写入前增加 Redis 队列；优化后使用同一脚本复测 500/20 → 1000/20。
3. 若卸载静态资源后 Node 仍单核满载，再考虑两进程 Node + Redis SSE Pub/Sub（Redis 用于进程间广播，不用于票账），避免直接开 PM2 cluster 导致大屏漏更新。

最后一组服务器资源摘要已回传；`verify/cleanup/destroy` 的终端输出未回传，是否恢复原始 IP 限流仍需以 `destroy` 成功输出为准。
