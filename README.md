# 活动配套管理系统

成都市广播电视台政商合作部的活动网络支撑平台。

## 功能

- **视频分组展示**：分组上传视频 → 生成链接/二维码发给客户播放；分组可设密码、可一键暂停（省带宽）；支持公众号/视频号链接导入与"视频抢救工作台"
- **投票评选**：多届多轮；专家评审（iPad 扫码评分）、大众评审（扫码绑定微信）、观众评审（大屏扫码投票）三群体勾选配置、权重制计分；大屏实时柱状图（SSE）；结果统计与 CSV 导出
- **AI 能力导航**：PPT 制作 / 图片生成 / 声音复刻 / 对口型 / 文生视频等第三方工具导航与 SOP

## 技术栈

Next.js 14（App Router）+ Prisma + MySQL 5.7 + Tailwind；Nginx + pm2 裸机部署，无 Docker；媒体支持本地磁盘或阿里云 OSS（后台可切换）。

## 本地开发

```bash
cp .env.example .env      # 配置 DATABASE_URL（本地 MySQL）
npm ci
npx prisma migrate deploy
npx prisma db seed        # admin / admin123
npm run dev               # http://localhost:3000
```

## 文档

| 文档 | 内容 |
|---|---|
| `doc/requirements.md` | 需求与范围 |
| `doc/architecture.md` | 技术选型与决策记录 |
| `doc/data-model.md` | 数据模型 |
| `doc/pages/` | 页面规划（地图/客户侧/现场/后台/设计规范） |
| `doc/deployment.md` | **部署手册** |
| `doc/research-wechat-video.md` | 视频号链接提取调研结论 |
| `doc/progress.md` | 当前进度（每次工作更新） |

## 部署

见 `doc/deployment.md`。日常更新一条命令：`bash scripts/deploy.sh`。
每日备份：`scripts/backup.sh`（crontab 配置见部署手册）。
