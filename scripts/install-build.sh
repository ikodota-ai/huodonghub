#!/usr/bin/env bash
# 服务器端：安装本地上传的构建包（替代服务器本地构建，适合小内存服务器）
# 前置：deploy-next-build.tar.gz 已上传到项目根目录（与 package.json 同级）
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy-next-build.tar.gz ] || { echo "错误：未找到 deploy-next-build.tar.gz（先通过宝塔面板上传到项目根目录）"; exit 1; }

echo "==> 1/4 解压新构建"
rm -rf .next-build
tar -xzf deploy-next-build.tar.gz

NEW_BUILD_ID="$(cat .next-build/BUILD_ID)"
CUR_BUILD_ID="$(cat .next/BUILD_ID 2>/dev/null || echo 无)"
echo "    构建包版本: $NEW_BUILD_ID（打包时间 $(stat -c '%y' deploy-next-build.tar.gz 2>/dev/null | cut -d. -f1 || echo 未知)）"
echo "    线上版本:   $CUR_BUILD_ID"
if [ "$NEW_BUILD_ID" = "$CUR_BUILD_ID" ]; then
  echo "!! 警告：构建包版本与线上版本完全相同——很可能忘了在宝塔面板重新上传新的 deploy-next-build.tar.gz！"
  echo "   8 秒后继续安装（按 Ctrl+C 中止，去重新上传构建包后再执行本脚本）…"
  sleep 8
fi

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
