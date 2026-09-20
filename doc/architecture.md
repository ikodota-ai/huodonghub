# 架构与决策记录

## 技术栈

- **全栈**：Next.js（App Router）+ TypeScript，前后台一套代码
- **样式**：Tailwind CSS；后台组件按需引入
- **数据库**：MySQL 5.7（utf8mb4），ORM 用 Prisma 或 Drizzle（均兼容 5.7）
- **鉴权**：自建 session（httpOnly cookie），后台账号 + 评委口令两套
- **实时**：SSE（Server-Sent Events）推大屏票数
- **视频处理**：服务器 ffmpeg（转码 faststart、截封面、读时长）
- **图表**：ECharts（大屏柱状图）
- **部署**：Nginx（反代 + HTTPS + 直接分发媒体文件）+ pm2 守护 Node + MySQL 本机，无 Docker

## 决策记录

### ADR-1 不用 RuoYi，全新开发

核心价值在客户侧 C 端页面（视频展示页、投票页、大屏），RuoYi 只解决后台脚手架且风格不适配；部门级后台仅十几张页面，为这点需求背 Java+Vue 双栈不划算；AI 辅助开发在绿地项目效率最高。

### ADR-2 后端用 Next.js(Node)，不用 Java/PHP

- 投票高并发是 I/O 密集，Node 事件循环天然适配
- 大屏 SSE 实时推送在 Node 里十几行代码；PHP 需 Swoole/Workerman，Java 需额外 WebSocket 配置
- 客户页 SSR 直出，微信内首屏快
- 借来的服务器内存有限：Node(~150MB) 远轻于 JVM(512MB+)
- 单一 TypeScript 语言，AI 辅助维护出错率低
- 短板与应对：无现成脚手架（页面少，直接写）；部署多一步构建（部署脚本固化）；版本锁定不追新

### ADR-3 集中式平台，不按活动单独建站

一年几十场活动，分开做 = 部署、账号、素材全割裂，维护成本 ×N。活动抽象为一条数据，功能挂活动下，历届自动归档。

### ADR-4 视频 Nginx 直接分发 + 随机路径

媒体文件不过 Node，Nginx 原生支持 Range 拖动播放，现场大流量也扛得住；随机路径防猜测盗链，配合分组开关控制带宽。

### ADR-5 存储抽象层

视频/文件读写走统一接口，当前实现为本地磁盘，未来可切 OSS / 腾讯云点播 VOD（约 10~30 元/月量级），只改配置。

### ADR-6 大屏用 SSE 不用 WebSocket

单向推送（服务端→大屏）SSE 足够且更轻；掉线自动重连由浏览器原生处理。

### ADR-7 MySQL 5.7 约束清单

禁用：窗口函数、CTE、JSON_TABLE、CHECK 约束（应用层兜底）。排序统计用冗余计数字段实现，本来就不依赖窗口函数。

## 部署拓扑

```
用户 ──HTTPS──> Nginx ──┬─ /              → Node(Next.js, pm2, 127.0.0.1:3000)
                        ├─ /api           → Node
                        ├─ /screen 等页面  → Node(SSR)
                        └─ /media/*       → 本地磁盘直发（try_files，Range）
                                          MySQL 5.7（仅监听 127.0.0.1）
                                          ffmpeg（上传后异步处理）
```

- 服务器：朋友阿里云 ECS（配置待确认：CPU/内存/磁盘/带宽）
- 域名：先用朋友已备案域名子域名；单位子域名 CNAME 过来后切换（前提：单位域名备案接入商为阿里云，否则需先做接入备案）
- HTTPS：certbot/acme.sh 自动续期
- 备份：每日 mysqldump + 媒体目录 rsync 到本地，脚本化

## 安全基线

- MySQL、Node 均不暴露公网端口，只走 Nginx
- 后台登录限流防爆破；评委口令每轮独立，可随时重置
- 活动链接可设密码与有效期；分组暂停即全网不可达
- 上传校验：仅 MP4/MOV，限制大小，服务端二次确认扩展名与 MIME

## 视频压制规范

- 出片统一 H.264 + AAC，MP4 容器，moov 前置（faststart）
- 1080p 码率 2~4Mbps（视服务器带宽下调至 720p/2Mbps）
- 系统侧上传后统一再过一遍 ffmpeg 保证 faststart，即使源文件未处理也能流式播放
