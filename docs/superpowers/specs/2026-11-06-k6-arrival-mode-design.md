# k6 恒定到达模式设计

## 背景

本机 k6 的 1000 个休眠 VU 可以运行，但 1000 个网络请求型 VU 会触发 macOS `failed to create new OS thread`。压测目标是现场人员在 20 秒内陆续扫码投票，并不要求 1000 个长期在线连接。

## 方案

为 `scripts/load-test/vote.js` 增加显式的 `LOAD_MODE=arrival`：

- `USERS=1000 DURATION=20s` 表示每秒到达 50 人，总计 1000 人、3000 票。
- `MAX_VUS=500` 限制执行器数量，执行器复用不代表减少总人数。
- 到达模式不再执行按 VU 编号计算的启动等待，由 k6 调度到达时间。
- `dropped_iterations` 必须为 0，`iterations` 必须等于 `USERS`，任一不满足都判失败。
- GET、POST、静态资源和业务检查沿用原脚本；完整操作耗时不再包含人为启动等待，不能与原模式直接比较。
- 未设置 `LOAD_MODE` 时保持原有 `per-vu-iterations` 行为不变。

不修改服务器配置，不提高 macOS 系统限制，不把压测端丢迭代解释为服务器失败。
