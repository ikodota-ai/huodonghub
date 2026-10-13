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
3. **Node ≥ 18.17（Next.js 14 硬性要求）+ pm2**，分两情况：
   - **正常情况**：软件商店装「PM2 管理器」，Node 版本选 20.x，「终端」里 `node -v` 显示 v20.x 即可。
   - **PM2 管理器提示"服务器版本过低"、最高只能装 v16/v17 测试版**（老系统如 CentOS 7，glibc 2.17，跑不了 Node 18+ 官方二进制）：**跳过 PM2 管理器插件**，终端手动装 glibc-217 专用构建的 Node 20（2026-10 实测最新 v20.20.2，新版可看 https://unofficial-builds.nodejs.org/download/release/ ）：
     ```bash
     yum install -y xz   # 解压 .tar.xz 需要（Debian/Ubuntu: apt install -y xz-utils）
     cd /tmp
     curl -fLO https://unofficial-builds.nodejs.org/download/release/v20.20.2/node-v20.20.2-linux-x64-glibc-217.tar.xz
     mkdir -p /www/server/nodejs20
     tar -xJf node-v20.20.2-linux-x64-glibc-217.tar.xz -C /www/server/nodejs20 --strip-components=1
     ln -sf /www/server/nodejs20/bin/node /usr/local/bin/node
     ln -sf /www/server/nodejs20/bin/npm  /usr/local/bin/npm
     ln -sf /www/server/nodejs20/bin/npx  /usr/local/bin/npx
     node -v    # 必须输出 v20.20.2；若报 GLIBC_2.28 not found 说明下错版本
     npm i -g pm2 && pm2 -v
     ```
     此情况下进程守护也不用面板，按第六节"命令行 pm2"操作。
4. **ffmpeg**：软件商店没有，在终端装：
   ```bash
   yum install -y ffmpeg      # CentOS/Alibaba Linux；或 apt install -y ffmpeg（Debian/Ubuntu）
   ffmpeg -version | head -1  # 确认
   ```
   CentOS 7 默认源没有 ffmpeg，报"No package available"就用静态构建（老系统可跑）：
   ```bash
   curl -fLO https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg-static.tar.xz
   tar -xJf /tmp/ffmpeg-static.tar.xz -C /usr/local/bin --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe'
   ffmpeg -version | head -1 && ffprobe -version | head -1
   ```
5. **内存 ≤2G 的服务器必须加 swap**（不加的话，第五节 `npm run build` 大概率内存不足被系统杀掉；而且杀在半路会把线上搞坏，见坑位速查表倒数第 2 行）。先 `free -h` 看 Swap 行，为 0 就加 2G swap（一次性，永久生效）：
   ```bash
   dd if=/dev/zero of=/swapfile bs=1M count=2048
   chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
   free -h    # 确认 Swap 行约 2.0G
   ```
   （宝塔「Linux 工具箱」插件里也有 swap 开关，效果一样。磁盘紧张先 `df -h /` 确认剩余 >3G。）

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

## 六、进程守护（按第一节的情况二选一）

**情况 1：PM2 管理器面板（插件装上了 Node 20 时）**
软件商店 → PM2 管理器 → 添加项目：
| 字段 | 值 |
|---|---|
| 项目名称 | `huodongpeitai` |
| 运行目录 | `/www/wwwroot/huodongpeitai` |
| 启动文件 | `node_modules/next/dist/bin/next` |
| 运行参数 | `start -p 3000` |
| 内存上限 | `1024`(MB) |
| 开机启动 | 勾选 |

添加后确认状态 online；终端 `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/admin/login` 应返回 200。

**情况 2：命令行 pm2（老系统手动装的 Node 20 时）**
```bash
cd /www/wwwroot/huodongpeitai
sed -i 's#cwd: "/www/huodongpeitai"#cwd: "/www/wwwroot/huodongpeitai"#' deploy/ecosystem.config.js
pm2 start deploy/ecosystem.config.js
pm2 save && pm2 startup   # 按它输出的提示再复制执行一条命令（注册 systemd 开机自启）
pm2 logs huodongpeitai --lines 30   # 确认 Ready，无报错
```
终端 `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/admin/login` 应返回 200。

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

1. **保持第七步的 80 配置不动**，Let's Encrypt → 勾选域名 → 申请（域名 DNS 须已解析到本服务器）。
   - **若宝塔报错「未找到标识信息 #error_page 404/404.html;，无法确定SSL配置添加位置」**：手工配置缺少宝塔锚点。在 server 块内 `server_name` 行之后插入以下空标记段，保存后重新申请：
     ```nginx
     #CERT-APPLY-CHECK--START
     # 用于SSL证书申请时的文件验证相关配置 -- 请勿删除
     #CERT-APPLY-CHECK--END

     #SSL-START SSL相关配置，请勿删除或修改下一行带注释的404规则
     #error_page 404/404.html;
     #SSL-END
     ```
     宝塔申请时就会在两段标记之间插入 listen 443 与证书行（我们的 location 块不受影响）。
2. 申请成功后终端确认：`ls /www/server/panel/vhost/cert/你的域名/`（应有 `fullchain.pem`、`privkey.pem`），且 `/www/server/panel/vhost/nginx/well-known/你的域名.conf` 已生成（自动续期验证用）。
3. 站点配置文件**整份替换**为下面模板（宝塔风格：单 server 同听 80+443，保留 CERT-APPLY-CHECK 续期 include；`error_page 497` 处理发到 443 的 HTTP 请求）：

```nginx
upstream dth_node {
    server 127.0.0.1:3000;
    keepalive 32;
}

limit_req_zone $binary_remote_addr zone=dth_login:10m rate=10r/m;

server
{
    listen 80;
    listen 443 ssl http2;
    server_name 你的域名;
    root /www/wwwroot/huodongpeitai/public;

    #CERT-APPLY-CHECK--START
    # 用于SSL证书申请时的文件验证相关配置 -- 请勿删除
    include /www/server/panel/vhost/nginx/well-known/你的域名.conf;
    #CERT-APPLY-CHECK--END

    #SSL-START SSL相关配置
    ssl_certificate    /www/server/panel/vhost/cert/你的域名/fullchain.pem;
    ssl_certificate_key    /www/server/panel/vhost/cert/你的域名/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000";
    error_page 497  https://$host$request_uri;
    #SSL-END

    client_max_body_size 64m;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1k;

    location /api/media/ {
        alias /www/wwwroot/huodongpeitai/media/;
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

    access_log /www/wwwlogs/huodongpeitai.log;
    error_log  /www/wwwlogs/huodongpeitai.error.log;
}
```

4. 面板里开启「强制 HTTPS」（宝塔自动插入 80→443 跳转段，与其续期机制配套；不开则 HTTP/HTTPS 都可用）。
5. 验证 `https://你的域名/admin/login`；改 `.env`：`BASE_URL="https://你的域名"` → `pm2 restart huodongpeitai`（二维码/分享链接才会用 https 生成）。
6. 确认阿里云**安全组放行 443**（宝塔「安全」防火墙同步检查）。
7. 微信网页授权（评审绑定 openid）要求 HTTPS，正式投票前必须完成本步。

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
（拉代码 → 装依赖 → 迁移 → 构建 → PM2 重启，全自动。构建在影子目录 `.next-build` 进行，成功后才切换替换 `.next`——构建中途失败/被杀只会丢弃半成品，线上继续跑旧版本，不会出现页面空白。）

### 方案 B：服务器内存不够构建时（本地构建 + 上传，推荐小内存机长期使用）

服务器构建反复 OOM（堆 3G 都不够）就别耗了——在自己电脑上构建，服务器只负责运行：

1. **本地**（Mac/开发机，已 `git pull` 到最新）：`bash scripts/package-build.sh` → 产出 `deploy-next-build.tar.gz`（约 33MB）。
2. **宝塔面板 → 文件** → 进入 `/www/wwwroot/huodongpeitai` → 上传该文件。
3. **宝塔终端**：`cd /www/wwwroot/huodongpeitai && git pull && bash scripts/install-build.sh`（解压 → 迁移 → 切换 .next → PM2 重启，几十秒完成）。

注意：项目无任何 `NEXT_PUBLIC_` 环境变量，`.next` 不含平台相关二进制，本地构建产物可直接在 Linux 服务器运行；环境变量仍以服务器 `.env` 为准（运行期读取）。

## 宝塔特有坑位速查

| 现象 | 原因/解法 |
|---|---|
| 系统盘 97% 满（构建/上传没空间），数据盘 `/data` 空着 | **不要整体搬 /www**（/www/server 是宝塔+MySQL 本体）→ 用 bind mount 只迁 `wwwroot`/`wwwlogs` 到数据盘，见文末"附录 A" |
| `systemctl start/restart nginx` 报 `bind() failed (98: Address already in use)` | 机器上有两个 nginx：systemd 单元是历史遗留（指向 /usr/local/nginx），实际服务的是宝塔的 /www/server/nginx（`ps -ef | grep "master process"` 可见）→ 报错无视；启停统一用宝塔面板或 `/etc/init.d/nginx {start|stop|reload}` |
| PM2 管理器"服务器版本过低"最高只有 v16/v17 | 老系统 glibc 2.17；Next.js 14 需 ≥18.17 → 按第一节"情况 2"手动装 glibc-217 版 Node 20，守护用命令行 pm2 |
| npm 装包 404（registry 是 `.../nodejs-release`） | 前人把 registry 错配成 Node 二进制镜像 → `npm config set registry https://registry.npmmirror.com` |
| 申请 SSL 报「未找到标识信息 #error_page 404/404.html;」 | 手工配置缺宝塔锚点 → 按第八节第 1 步插入空 CERT-APPLY-CHECK / SSL-START 标记段后重新申请 |
| 终端 `node: command not found` | PM2 管理器里没选 Node 版本；重开终端让它注入 PATH |
| 构建卡住/被杀（"已杀死/Killed"，多在 Collecting build traces 阶段） | 内存不足被系统 OOM 杀掉 → 按第一节第 5 步加 2G swap 后重跑 |
| 构建报 `JavaScript heap out of memory`（堆到上限就死，swap 没用上） | 不是系统内存不够，是 **Node 堆上限** → deploy.sh 已内置 `--max-old-space-size=3072`；**3072 还死说明这台机器构建不动，直接用"方案 B：本地构建+上传"（第十一节），别再硬撑** |
| `swapoff /swapfile` 卡住不动 | 没卡死：swap 里有数据（`free -h` 看 used）就要逐页搬回内存，可用内存 > used 就必成功，等 1~5 分钟；另开终端 `watch -n 2 free -h` 看 used 降到 0 即完成，**别 Ctrl+C** |
| 后台部分页面空白，控制台 `_next/static/chunks/*.js` 报 400 或 ChunkLoadError（常在重新部署/改 HTTPS 后发现） | 上次构建中途被杀，`.next` 是半成品而 pm2 还在跑旧构建（新旧 chunk 对不上）→ 加 swap 后重跑 `bash scripts/deploy.sh`；新版影子构建已从根上杜绝此状态 |
| 备份脚本报 mysqldump not found | 已修复（脚本内置宝塔路径）；确认 MySQL 是宝塔装的 |
| 视频能播不能拖/大流量卡 | 走了 Node 而非 Nginx 直发 → 检查第七步 `alias` 路径末尾的 `/` |
| 大屏数字不实时跳 | `/api/screen/` 没关 `proxy_buffering` → 对照第七步配置 |
| 上传 413 | `client_max_body_size` 没生效（443 段忘了复制） |
| 宝塔"网站加速"类插件 | 别开，会把 SSE 和大屏页面缓存坏 |

## 附录 A：系统盘满，把 wwwroot 迁到数据盘（bind mount 法，可回滚）

原则：只迁 `wwwroot`、`wwwlogs`（占空间大头）；`/www/server`（宝塔/MySQL 本体）原地不动。用 bind mount 而非软链——PHP open_basedir 会解析软链真实路径导致"防跨站攻击"误伤，bind mount 对所有程序透明、零配置改动。全程复制不删除，验证后再清理：

```bash
which rsync || yum install -y rsync
mkdir -p /data/wwwroot /data/wwwlogs
rsync -avP /www/wwwroot/ /data/wwwroot/          # 第一遍（不停站）
rsync -avP /www/wwwlogs/ /data/wwwlogs/
pm2 stop huodongpeitai && /etc/init.d/nginx stop # 停站 1~2 分钟（宝塔的 nginx 用 init.d 管，别用 systemctl，见坑位速查）
rsync -avP --delete /www/wwwroot/ /data/wwwroot/ # 第二遍增量（快）
rsync -avP --delete /www/wwwlogs/ /data/wwwlogs/
find /www/wwwroot -type f | wc -l                # 与下一行数字一致才继续
find /data/wwwroot -type f | wc -l
mv /www/wwwroot /www/wwwroot.bak && mkdir /www/wwwroot
mv /www/wwwlogs /www/wwwlogs.bak && mkdir /www/wwwlogs
mount --bind /data/wwwroot /www/wwwroot
mount --bind /data/wwwlogs /www/wwwlogs
printf '/data/wwwroot /www/wwwroot none bind 0 0\n/data/wwwlogs /www/wwwlogs none bind 0 0\n' >> /etc/fstab
/etc/init.d/nginx start && pm2 restart huodongpeitai
# 验证各网站/后台/视频播放正常后再释放空间：
# （.user.ini 有 chattr +i 锁，需先解锁）
# find /www/wwwroot.bak -name ".user.ini" -exec chattr -i {} +
# rm -rf /www/wwwroot.bak /www/wwwlogs.bak && df -h /
```

回滚：`umount /www/wwwroot /www/wwwlogs` → `.bak` 改回原名 → 重启 nginx。

注意：rsync 不复制 immutable 属性，迁移后线上 `.user.ini` 会失去宝塔的防篡改锁，建议补回：`find /www/wwwroot -name ".user.ini" -exec chattr +i {} +`
