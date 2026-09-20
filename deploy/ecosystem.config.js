// pm2 进程守护配置：pm2 start deploy/ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "huodongpeitai",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/www/huodongpeitai", // TODO: 改为实际项目目录
      instances: 1, // 单实例即可：SSE 大屏连接 + 视频上传进度都在进程内存里
      exec_mode: "fork",
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      time: true,
    },
  ],
};
