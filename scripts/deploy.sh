#!/usr/bin/env bash
# 部署/更新：拉代码 → 装依赖 → 迁移数据库 → 构建 → 重启
# 用法：bash scripts/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> 1/5 拉取代码"
git pull --ff-only || echo "（非 git 部署可忽略）"

echo "==> 2/5 安装依赖"
npm ci --omit=dev=false

echo "==> 3/5 数据库迁移"
npx prisma migrate deploy
npx prisma generate

echo "==> 4/5 构建（影子目录，成功后才切换，构建失败不影响线上）"
rm -rf .next-build
BUILD_DIST_DIR=.next-build npm run build
rm -rf .next.old
[ -d .next ] && mv .next .next.old
mv .next-build .next
rm -rf .next.old

echo "==> 5/5 重启服务"
if pm2 describe huodongpeitai >/dev/null 2>&1; then
  pm2 restart huodongpeitai
else
  pm2 start deploy/ecosystem.config.js
  pm2 save
fi

echo "完成。健康检查：curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/admin/login"
