# OSS 已有媒体迁移设计

日期：2026-11-06

## 背景与目标

系统已支持新上传媒体写入阿里云 OSS，但已有本地图片、封面和视频仍由 Nginx 从 ECS 直接分发。公网压测表明静态请求和图片流量会占用源站连接、CPU 与带宽。此次目标是在不修改数据库媒体路径、不改变公开 `/api/media/` 地址的前提下，把已有媒体安全复制到当前后台配置的 OSS，并在核验后切换到 OSS 回源。

## 范围

包含 `MEDIA_ROOT` 下：

- `images/`：选手照片、活动封面、大屏主视觉等。
- `covers/`：视频封面。
- `videos/`：已转码视频及其同目录附属文件。

明确不包含：

- `tmp/`、上传会话和转码中间文件。
- `backups/`、数据库导出、`.env`、AccessKey 等敏感内容。
- Next.js `.next/static`、数据库、API、HTML 和 SSE。

## 方案

新增服务器端 Node.js 工具 `scripts/migrate-media-to-oss.js`，使用项目已有 Prisma 与 `ali-oss` 依赖，从 `settings.storage.config` 读取当前 OSS 配置。工具不打印 AccessKey、Secret、数据库 URL 或带签名 URL。

选择该方案而非 ossutil 手工同步的原因：可复用后台已验证配置、逐项校验、断点续跑、生成机器可读报告，并在任何异常时阻止激活。

## 命令与行为

```bash
node scripts/migrate-media-to-oss.js scan
node scripts/migrate-media-to-oss.js upload
node scripts/migrate-media-to-oss.js verify
```

### scan

- 要求当前存储驱动为 `oss`，Region、Bucket、AccessKey ID 配置完整。
- 对象前缀不得以 `/` 开头，自动把末尾规范为 `/`；本次生产配置为 `huodonghub/`。
- 只枚举范围内的普通文件，输出每个目录的文件数、字节数和总容量，不发起上传。
- 对象键统一为 `${prefix}${相对路径}`，Windows 路径分隔符转换为 `/`。

### upload

- 默认并发 2，避免 2C4G 服务器瞬时资源过高。
- 先读取 OSS 对象头：不存在则上传；大小一致且可用 ETag/MD5 一致则跳过。
- 同名对象大小不一致时停止该文件并记为冲突，不覆盖；任何冲突都使最终报告失败。
- 上传使用本地文件流，设置正确的图片/视频 Content-Type，不设置公开 ACL，不改变 Bucket 私有策略。
- 每个文件上传后立即 HEAD 校验；网络错误可安全重跑，已校验文件会跳过。
- 全程不删除、重命名或修改本地文件。

### verify

- 重新扫描全部本地文件并逐个 HEAD OSS，不能因上次上传成功而跳过复核。
- 校验对象存在、Content-Length 与本地大小一致；对非分片 ETag 再核对本地 MD5。
- 分片 ETag 无法直接作为 MD5 时记录校验方式并至少强制核对大小。
- 报告写入 `output/oss-migration/report.json`，包含时间、Bucket、Region、前缀、文件清单、校验结果与失败原因，不包含密钥。
- 只要存在缺失、大小不符、MD5 不符、冲突或读取错误，命令退出码为 1，不得激活。

## 激活与短暂停机

上传和 verify 均在线执行。只有报告全部通过后，才提供单独的人工激活命令，不由迁移脚本自动删除文件：

1. 暂停后台上传，执行 `pm2 stop huodongpeitai`。
2. 在项目目录外创建带时间戳的本地备份目录。
3. 将 `media/images`、`media/covers`、`media/videos` 整体移入备份目录，并新建同名空目录供后续上传中转。
4. 执行 `pm2 restart huodongpeitai`，检查 PM2 online。
5. 抽查原 `/api/media/images/...`、封面和视频：本地缺失后应回退 Node，再 302 到 OSS；公开页面和 Range 播放正常。

切换窗口只需数秒。Nginx 在目录移动后、Node 恢复前可能短暂返回媒体错误，因此不能在正式活动进行中激活。

## 回滚

若激活后出现异常：

1. 停止 PM2。
2. 删除本次新建的空目录，把备份中的原目录移回 `media/`。
3. 重启 PM2，即可恢复 Nginx 本地直发。

OSS 中已复制文件保留，不影响回滚，也不需在故障时删除。

## 验收

- 本地测试使用临时目录和假 OSS 客户端，覆盖路径映射、范围排除、跳过一致文件、冲突拒绝、缺失/大小/MD5 失败和报告不泄露密钥。
- 服务器先运行 scan，确认文件数量与容量符合预期。
- upload 后 verify 必须退出码 0，失败文件数为 0。
- 激活后抽查至少一张旧选手照片、一张旧封面和一个旧视频；媒体入口最终返回 OSS 200，视频支持 Range。
- 回滚路径只需恢复目录，不依赖数据库变更。

## 后续独立工作

Next.js 静态资源的 `assetPrefix`、OSS/CDN 上传与发布顺序属于另一项改造，不在本次脚本内实现。媒体迁移完成后，压测脚本需加入封面和选手图片请求，再与既有 500/20、1000/20 结果比较。
