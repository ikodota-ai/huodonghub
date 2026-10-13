// pm2 进程守护配置：pm2 start deploy/ecosystem.config.js && pm2 save && pm2 startup
const path = require("path");

module.exports = {
  apps: [
    {
      name: "huodongpeitai",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: path.join(__dirname, ".."), // 自动定位项目根目录，无需手改
      instances: 1, // 单实例即可：SSE 大屏连接 + 视频上传进度都在进程内存里
      exec_mode: "fork",
      // Next.js 生产进程正常水位可达 1G 上下，阈值太小会被误杀
      //（上传会话、SSE 大屏连接全断）。给足余量，防泄漏失控交给 swap。
      max_memory_restart: "1536M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      time: true,
    },
  ],
};
