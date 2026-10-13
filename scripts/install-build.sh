#!/usr/bin/env bash
# 服务器端：安装本地上传的构建包（替代服务器本地构建，适合小内存服务器）
# 前置：deploy-next-build.tar.gz 已上传到项目根目录（与 package.json 同级）
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy-next-build.tar.gz ] || { echo "错误：未找到 deploy-next-build.tar.gz（先通过宝塔面板上传到项目根目录）"; exit 1; }

echo "==> 1/4 解压新构建"
rm -rf .next-build
tar -xzf deploy-next-build.tar.gz

echo "==> 2/4 数据库迁移"
npx prisma migrate deploy
npx prisma generate

echo "==> 3/4 切换 .next"
rm -rf .next.old
[ -d .next ] && mv .next .next.old
mv .next-build .next
rm -rf .next.old deploy-next-build.tar.gz

echo "==> 4/4 重启服务"
pm2 restart huodongpeitai
echo "完成。健康检查：curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/admin/login"
