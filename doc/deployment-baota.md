# 宝塔面板部署手册

> 适用：服务器已装宝塔面板（Linux 版）。命令行版见 `doc/deployment.md`，概念对照（PHP/Java → Next.js）也在那里。
> 全文以项目目录 `/www/wwwroot/huodongpeitai` 为例（宝塔默认站点根目录在 `/www/wwwroot/`）。

## 宝塔功能映射（先看这个）

| 命令行部署步骤 | 宝塔里的对应位置 |
|---|---|
| 装 Nginx / MySQL 5.7 | 软件商店 → 运行环境 |
| 装 Node 20 + pm2 | 软件商店 → **PM2 管理器**（装时会选 Node 版本，选 20.x） |
| 建数据库 | 数据库 → 添加数据库 |
| Nginx 站点配置 | 网站 → 添加站点 → 设置 → 配置文件 |
| HTTPS 证书 | 网站 → 设置 → SSL（Let's Encrypt 一键） |
| crontab 每日备份 | 计划任务 → Shell 脚本 |
| 加 swap（防构建 OOM） | 软件商店 → Linux 工具箱 → swap/虚拟内存 |
| 服务器终端 | 面板左侧「终端」（或自己 SSH 上去都一样） |

## 一、装运行环境（软件商店）

1. **Nginx**：装（一般已有）。
2. **MySQL 5.7**：装。若服务器已是 MySQL 8.0 也能跑（本项目未用 8.0 专有语法），不必降级。
3. **PM2 管理器**：装，Node 版本选 **20.x**。装完后「终端」里 `node -v` 应显示 v20.x。
4. **ffmpeg**：软件商店没有，在终端装：
   ```bash
   yum install -y ffmpeg      # CentOS/Alibaba Linux；或 apt install -y ffmpeg（Debian/Ubuntu）
   ffmpeg -version | head -1  # 确认
   ```
5. **内存 <2G 的服务器**：装「Linux 工具箱」→ 加 2G swap（否则第 4 步构建会内存不足被杀）。

## 二、建数据库（数据库 → 添加数据库）

- 数据库名：`huodongpeitai`
- **字符集必须选 `utf8mb4`**（宝塔默认 utf8，手动改）
- 用户名建议同库名，密码用宝塔生成的强密码（记下来，下面 .env 要用）
- 访问权限：本地服务器（127.0.0.1）

## 三、上传代码（二选一）

**方式 A：git（推荐，以后 `bash scripts/deploy.sh` 一键更新）**
```bash
# 终端执行：生成服务器 SSH key，把公钥贴到 GitHub 仓库 Settings → Deploy keys（只读）
ssh-keygen -t ed25519 -C "baota-server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
cd /www/wwwroot && git clone git@github.com:ikodota-ai/huodonghub.git huodongpeitai
```

**方式 B：文件管理上传**
本地把项目打包（**排除** node_modules / .next / media / .git），文件管理上传到 `/www/wwwroot/` 解压后改名为 `huodongpeitai`。

## 四、配置 .env（文件管理 → 在项目目录新建 `.env`）

```ini
DATABASE_URL="mysql://huodongpeitai:第二步的数据库密码@127.0.0.1:3306/huodongpeitai"
MEDIA_ROOT="/www/wwwroot/huodongpeitai/media"
SESSION_SECRET="随便一段64位随机字符串"
BASE_URL="https://你的域名"
```
SESSION_SECRET 可在终端生成：`openssl rand -hex 32`

## 五、装依赖 + 迁移 + 构建（终端）

```bash
cd /www/wwwroot/huodongpeitai
npm ci
npx prisma migrate deploy     # 建表
npx prisma db seed            # 创建 admin / admin123（登录后立即改密码）
npm run build                 # 2~5 分钟，内存不足被杀就回去加 swap
mkdir -p media logs
```

## 六、PM2 管理器守护进程（软件商店 → PM2 管理器 → 添加项目）

| 字段 | 值 |
|---|---|
| 项目名称 | `huodongpeitai` |
| 运行目录 | `/www/wwwroot/huodongpeitai` |
| 启动文件 | `node_modules/next/dist/bin/next` |
| 运行参数 | `start -p 3000` |
| 内存上限 | `1024`(MB) |
| 开机启动 | 勾选 |

添加后确认状态 online；终端 `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/admin/login` 应返回 200。

## 七、网站反代（关键，别用"反向代理"按钮，直接整份替换配置文件）

1. 网站 → 添加站点：域名填你的（如 `vote.example.com`），根目录任意（如 `/www/wwwroot/huodongpeitai/public`），PHP 选纯静态，不创建数据库/FTP。
2. 网站 → 该站点 → 设置 → **配置文件**，整份替换为下面内容（改 3 处 TODO）：

```nginx
upstream dth_node {
    server 127.0.0.1:3000;
    keepalive 32;
}

limit_req_zone $binary_remote_addr zone=dth_login:10m rate=10r/m;

server {
    listen 80;
    server_name vote.example.com;          # TODO 1: 你的域名

    client_max_body_size 64m;              # 视频分片上传单片 8MB，留余量

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1k;

    # 媒体直发：不过 Node，原生 Range 拖动；本地缺失回退 Node（OSS 模式 302）
    location /api/media/ {
        alias /www/wwwroot/huodongpeitai/media/;   # TODO 2: MEDIA_ROOT 绝对路径，末尾带 /
        location ~* ^/api/media/(tmp|backups)/ { deny all; }
        error_page 404 = @media_fallback;
        add_header Accept-Ranges bytes;
        add_header Cache-Control "public, max-age=86400";
        expires 7d;
    }
    location @media_fallback {
        proxy_pass http://dth_node;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # 大屏 SSE：必须关缓冲，否则大屏不实时刷新
    location /api/screen/ {
        proxy_pass http://dth_node;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    # 登录防爆破限流
    location = /api/auth/login {
        limit_req zone=dth_login burst=5 nodelay;
        proxy_pass http://dth_node;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://dth_node;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    access_log /www/wwwlogs/huodongpeitai.log;    # TODO 3: 宝塔日志目录习惯
    error_log  /www/wwwlogs/huodongpeitai.error.log;
}
```

3. 保存后宝塔会自动 `nginx -t` 并重载；浏览器开 `http://域名/admin/login` 应见到登录页。

## 八、HTTPS（网站 → 设置 → SSL）

1. Let's Encrypt → 勾选域名 → 申请（域名 DNS 须已解析到本服务器）。
2. 申请成功后开启「强制 HTTPS」。
3. **注意**：宝塔自动生成的 443 server 段只含简单反代；把上面第七步的 5 个 `location` 块（含 upstream 外的全部 location 与 `client_max_body_size`）复制进 443 server 段内，保存。
4. 微信网页授权（评审绑定 openid）要求 HTTPS，正式投票前必须完成本步。

## 九、每日备份（计划任务）

计划任务 → 添加任务：
- 任务类型：**Shell 脚本**
- 脚本内容：`bash /www/wwwroot/huodongpeitai/scripts/backup.sh >> /www/wwwroot/huodongpeitai/media/backups/cron.log 2>&1`
- 执行周期：每天 03:15
- 先手动「执行」一次，再到后台 → 系统设置看「最近备份」是否显示今天（脚本与后台手动备份按钮均已兼容宝塔 MySQL 路径 `/www/server/mysql/bin`）。

**借来的服务器随时可能回收：每月至少一次用文件管理把 `media/backups/` 里最新备份下载到自己电脑。**

## 十、防火墙与端口

- 宝塔「安全」与**阿里云安全组**：只放行 80、443、宝塔面板端口；**不要放行 3000**（Node 只该被本机 Nginx 访问）。
- 宝塔 MySQL 默认仅监听 127.0.0.1，保持不动。

## 十一、日常更新

本地开发完 `git push` 后，宝塔终端执行：
```bash
cd /www/wwwroot/huodongpeitai && bash scripts/deploy.sh
```
（拉代码 → 装依赖 → 迁移 → 构建 → PM2 重启，全自动）

## 宝塔特有坑位速查

| 现象 | 原因/解法 |
|---|---|
| 终端 `node: command not found` | PM2 管理器里没选 Node 版本；重开终端让它注入 PATH |
| 构建卡住/被杀 | 内存不足 → Linux 工具箱加 2G swap |
| 备份脚本报 mysqldump not found | 已修复（脚本内置宝塔路径）；确认 MySQL 是宝塔装的 |
| 视频能播不能拖/大流量卡 | 走了 Node 而非 Nginx 直发 → 检查第七步 `alias` 路径末尾的 `/` |
| 大屏数字不实时跳 | `/api/screen/` 没关 `proxy_buffering` → 对照第七步配置 |
| 上传 413 | `client_max_body_size` 没生效（443 段忘了复制） |
| 宝塔"网站加速"类插件 | 别开，会把 SSE 和大屏页面缓存坏 |
