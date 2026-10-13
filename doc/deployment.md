# 部署手册

> 目标环境：阿里云 ECS（借用的服务器），Nginx + Node(pm2) + MySQL 5.7，无 Docker。
> 全文以 `/www/huodongpeitai` 为项目目录示例，实际操作时替换。
> **服务器有宝塔面板？直接看 `doc/deployment-baota.md`**（面板操作版，本文为命令行版）。

## 零、给 PHP/Java 开发者的心智模型

Next.js 部署**更像 Java，不像 PHP**：

| 环节 | PHP | Java | 本项目（Next.js） |
|---|---|---|---|
| 产出物 | 源码直接放 web 目录 | `mvn package` 打 jar | `npm run build` 产出 `.next/` 目录（≈ jar） |
| 运行时 | php-fpm 通用进程，按请求执行 .php | `java -jar` 常驻 JVM 进程 | `next start` 常驻 Node 进程（监听 127.0.0.1:3000） |
| 进程守护 | php-fpm 自带 | systemd / supervisor | **pm2**（`pm2 save` + `pm2 startup` = 开机自启） |
| 前置代理 | Nginx → php-fpm:9000 | Nginx → tomcat:8080 | Nginx → 127.0.0.1:3000（配置一模一样，已写好） |
| 改代码后 | 保存即生效 | 重新打包重启 | 同 Java：`npm run build` + `pm2 restart` |
| 依赖 | composer install | maven | `npm ci`（node_modules 不上传，服务器现装） |
| 环境配置 | .env / php.ini | application.yml | `.env`（数据库连接、密钥、域名，勿进 git） |
| 数据库迁移 | 手工 SQL | flyway / liquibase | `npx prisma migrate deploy`（迁移文件在 prisma/migrations/） |
| 静态大文件 | Nginx 直发 | Nginx 直发 | Nginx 直发 `media/` 视频（原生 Range 拖动，已配好） |

三个容易踩的坑：
1. **改完代码必须重新 build + restart 才生效**——和 PHP"传上去就生效"完全不同，像 Java。
2. **构建吃内存**：服务器 <2G 内存时 `npm run build` 可能 OOM，先加 2G swap（或本地构建后连 `.next/` 一起 rsync）。
3. **不要上传 node_modules 和 .next**：到服务器后 `npm ci` + `npm run build` 重新生成（如同不把 target/ 传服务器）。

## 一、服务器准备（一次性）

```bash
# Node 18+（建议 20 LTS）
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -   # CentOS/Alibaba Linux
yum install -y nodejs

# pm2 守护进程
npm i -g pm2

# ffmpeg（视频压制流水线）
yum install -y ffmpeg   # 或静态构建：https://johnvansickle.com/ffmpeg/

# Nginx
yum install -y nginx && systemctl enable --now nginx

# MySQL 5.7 确认仅监听本机
ss -lntp | grep 3306   # 应显示 127.0.0.1:3306
```

## 二、首次部署

```bash
# 1. 上传代码（git clone 或 rsync 均可）
mkdir -p /www && cd /www
git clone <仓库地址> huodongpeitai   # 或本地 rsync -avz --exclude node_modules ./ root@server:/www/huodongpeitai

cd /www/huodongpeitai

# 2. 配置环境变量
cat > .env <<EOF
DATABASE_URL="mysql://root:密码@127.0.0.1:3306/huodongpeitai"
MEDIA_ROOT="/www/huodongpeitai/media"
SESSION_SECRET="$(openssl rand -hex 32)"
BASE_URL="http://vote.example.com"
EOF

# 3. 建库（utf8mb4）
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS huodongpeitai DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. 依赖 + 迁移 + 种子 + 构建
npm ci
npx prisma migrate deploy
npx prisma db seed      # 创建 admin / admin123，登录后立即改密码
npm run build

# 5. 启动 + 开机自启
sed -i 's#/www/huodongpeitai#实际路径#g' deploy/ecosystem.config.js
pm2 start deploy/ecosystem.config.js
pm2 save && pm2 startup   # 按提示再执行一条命令

# 6. Nginx
cp deploy/nginx.conf /etc/nginx/conf.d/huodong.conf
# 编辑：server_name 改域名；alias 改 MEDIA_ROOT 绝对路径
nginx -t && systemctl reload nginx

# 7. 每日备份（凌晨 3:15）
chmod +x scripts/backup.sh
(crontab -l 2>/dev/null; echo "15 3 * * * /www/huodongpeitai/scripts/backup.sh >> /www/huodongpeitai/media/backups/cron.log 2>&1") | crontab -
```

## 三、日常更新

```bash
bash scripts/deploy.sh    # 拉代码→装依赖→迁移→构建→重启，一条搞定
```

## 四、域名与 HTTPS

1. **朋友域名子域**：让其 DNS 加 A 记录指向服务器 IP，改 `server_name` 即可。
2. **单位子域名**：申请到后 CNAME 到朋友域名（或 A 记录到服务器），改 `server_name`。
3. **HTTPS**：`yum install -y certbot python3-certbot-nginx && certbot --nginx`，自动改配置。
   - 微信网页授权（评审绑定 openid）要求业务域名已备案 + HTTPS，正式投票前务必完成。

## 五、容量与性能基线

| 项目 | 基线 | 说明 |
|---|---|---|
| 服务器 | 2C4G 起步 | ffmpeg 压制吃 CPU，内存 <2G 时构建可能 OOM（可加 swap） |
| 磁盘 | 按视频量估算 | 1080p/2Mbps ≈ 15MB/分钟；备份另占一倍 |
| 带宽 | 5Mbps 可支撑 | 单路 2Mbps 视频约 2 人/Mbps 并发；超量切 OSS + CDN |
| Node | 单实例 | SSE 与上传进度在内存中，扩多实例需改造，暂不需要 |

## 六、故障排查

| 现象 | 排查 |
|---|---|
| 502 | `pm2 logs huodongpeitai`；确认 Node 在 3000 端口 |
| 视频不能拖动 | 检查是否走了 Nginx 直发（响应头有 `Accept-Ranges`），moov 是否前置 |
| 大屏不刷新 | 确认 Nginx 对 `/api/screen/` 关了 `proxy_buffering` |
| 上传卡住 | `pm2 logs` 看 ffmpeg；服务器磁盘 `df -h` |
| 备份没跑 | `crontab -l` 与 `media/backups/cron.log` |

## 七、安全清单

- [ ] admin 默认密码已修改（系统设置 → 用户）
- [ ] `.env` 权限 600，不进 git
- [ ] MySQL 仅 127.0.0.1；root 远程登录关闭
- [ ] HTTPS 已启用；HTTP 强制跳转（certbot 可自动配）
- [ ] 登录限流生效（nginx.conf 已内置）
- [ ] 每日备份 cron 已配，且**每月至少一次**把备份拷到服务器以外（OSS/本地电脑）——借来的服务器随时可能回收
