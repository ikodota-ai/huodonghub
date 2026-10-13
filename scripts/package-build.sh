#!/usr/bin/env bash
# 本地（内存充足的机器）构建并打包 .next——服务器内存不足时的"本地构建 + 上传"部署方案
# 用法：bash scripts/package-build.sh
# 产出：项目根目录 deploy-next-build.tar.gz
# 后续：宝塔面板上传到服务器项目根目录 → 服务器执行 bash scripts/install-build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

cp tsconfig.json /tmp/dth-tsconfig.bak
trap 'mv /tmp/dth-tsconfig.bak tsconfig.json 2>/dev/null || true' EXIT  # 还原 next build 对 tsconfig 的自动改写

rm -rf .next-build
BUILD_DIST_DIR=.next-build npm run build

export COPYFILE_DISABLE=1   # 防止 macOS tar 混入 ._ AppleDouble 文件
rm -f deploy-next-build.tar.gz
tar -czf deploy-next-build.tar.gz .next-build
rm -rf .next-build

echo "完成：deploy-next-build.tar.gz（$(du -sh deploy-next-build.tar.gz | cut -f1)）"
echo "下一步：宝塔面板 → 文件 → 项目根目录 → 上传此文件 → 服务器执行 bash scripts/install-build.sh"
