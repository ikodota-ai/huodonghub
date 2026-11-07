# 仪表盘 OSS 前缀用量与运行状态设计

日期：2026-11-06

## 目标

在后台仪表盘增加存储运行卡片，只统计当前媒体配置的对象前缀（生产为 `huodonghub/`），帮助管理员确认 OSS 是否可读、项目占用多少存储，以及本地媒体是否仍有残留。不展示整个 Bucket 用量，不展示流量或费用。

## 方案选择

采用独立异步查询接口、10 分钟内存缓存和手动刷新。相比每次打开仪表盘都遍历 OSS，该方式避免阻塞原有仪表盘；相比定时任务，无需新增系统依赖，且当前 PM2 单实例可直接使用进程内缓存。

## 接口

新增 `GET /api/settings/storage/usage`，仅允许已登录管理员访问。`?refresh=1` 跳过缓存，其余请求优先使用 10 分钟内的结果。

返回结构：

```json
{
  "ok": true,
  "data": {
    "driver": "oss",
    "oss": { "region": "oss-cn-chengdu", "bucket": "zonghe", "prefix": "huodonghub/" },
    "remote": { "status": "ok", "objects": 141, "bytes": 7360000000, "checkedAt": "...", "durationMs": 180 },
    "local": { "files": 0, "bytes": 0 },
    "cached": false
  }
}
```

接口不返回 AccessKey ID/Secret、数据库 URL、签名 URL 或其他前缀的对象清单。错误信息转换为安全的状态与中文提示，不透出凭证或请求签名。

## OSS 统计与健康检查

- 使用当前 `storage.config` 的 Region、Bucket、AK 和前缀创建 OSS 客户端。
- 通过 `list` 分页获取 `prefix=huodonghub/` 的对象，`max-keys=1000`，使用 `nextMarker` 直至结束，并防止重复 Marker 造成死循环。
- 只累加本次分页返回且对象名以该前缀开头的对象，不调用 Bucket 总用量接口，不统计其他项目。
- 对象数包含 OSS 目录标记对象；容量为对象 Size 之和，明确标注“本项目前缀用量，非整个 Bucket、非账单”。
- 同一次只读列表请求同时证明读取能力正常，不写入或删除 `.ping` 文件。
- `AccessDenied/InvalidAccessKeyId/SignatureDoesNotMatch` 归为配置或权限问题，提示检查 RAM 的 `ListObjects` 权限；超时和其他网络异常归为连接失败，不误报为权限不足。
- 本地驱动或 OSS 配置不完整时返回对应状态，不发起远程请求。

## 本地残留

仅递归统计 `MEDIA_ROOT/images`、`MEDIA_ROOT/covers`、`MEDIA_ROOT/videos` 中的普通文件，忽略符号链接，不包含 `tmp/backups`，也不统计激活时移到项目外的备份目录。用于判断媒体是否仍可能由 Nginx 本地直发。

## 缓存

- 缓存键只包含驱动、Region、Bucket、前缀，不包含 Secret。
- 同一配置 10 分钟内复用结果；配置变化自动失效；`refresh=1` 强制重新统计。
- 查询失败不缓存为正常结果，允许管理员修复后立即手动刷新。
- PM2 重启后缓存自然清空，首次查询异步显示加载状态，不阻塞其他仪表盘数据。

## 仪表盘展示

存储卡片包含：驱动与状态徽标、Bucket/Region/前缀、前缀对象数与容量、本地残留文件数与容量、最近统计时间和刷新按钮。加载与失败状态均在卡片内展示，不影响活动、视频、投票等原有仪表盘内容。

## 验收

- 假 OSS 分页包含两个前缀时，只累加目标前缀；对象数、字节数和 Marker 翻页正确。
- 权限错误、网络错误、本地模式、配置缺失均返回对应状态且不泄露 Secret。
- 10 分钟内第二次请求命中缓存，手动刷新绕过缓存，前缀变化自动重新查询。
- 本地统计排除 tmp/backups 和符号链接。
- 未登录/非管理员不能访问；管理员界面加载、正常、失败和手动刷新状态可用。
- TypeScript、ESLint、生产构建通过；不改变媒体上传、迁移、播放和投票逻辑。
