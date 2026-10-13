/** @type {import('next').NextConfig} */
const nextConfig = {
  // 影子构建：deploy.sh 设 BUILD_DIST_DIR=.next-build，构建成功后再切换为 .next，
  // 避免构建中途失败（如内存不足被杀）时把线上正在使用的 .next 留在半成品状态。
  distDir: process.env.BUILD_DIST_DIR || ".next",
};

export default nextConfig;
