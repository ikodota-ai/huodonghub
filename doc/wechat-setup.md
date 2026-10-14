# 公众号对接指南（网页授权 openid）

用途：观众投票 / 大众评审绑定时用 openid 做"一人一号"身份（最严谨档）。不配公众号也能用——系统自动降级为设备指纹弱防刷。

## 0. 前提：公众号类型

| 类型 | 能否用 |
|---|---|
| **认证服务号** | ✅ 有"网页授权"权限 |
| 未认证服务号 / 订阅号 | ❌ 无权限（errcode=48001） |
| 接口测试号（mp.weixin.qq.com/debug/cgi-bin/sandbox） | ✅ 调试可用，关注测试号的用户才有效 |

## 1. 拿 AppID / AppSecret

[mp.weixin.qq.com](https://mp.weixin.qq.com) → **设置与开发 → 基本配置** → 开发者ID（AppID）、开发者密码（AppSecret，需管理员扫码查看/重置）。

## 2. 配"网页授权域名"（最容易漏的一步）

**设置与开发 → 公众号设置 → 功能设置 → 网页授权域名** → 填 `cdbs.lanaoboxiang.com`（**只填域名，不带 https://，不带路径**）。

保存前微信要求验证域名归属：下载它给的 `MP_verify_xxxxxxxx.txt`，让 `https://cdbs.lanaoboxiang.com/MP_verify_xxxxxxxx.txt` 能访问到：

1. 宝塔「文件」→ 项目目录 `/www/wwwroot/huodongpeitai/public/` → 上传该 txt；
2. `pm2 restart huodongpeitai`（Next 启动时扫描 public 目录，后放的文件必须重启才生效）；
3. 浏览器访问该 txt 地址确认能下载 → 回公众号后台点保存。

## 3. 系统里填配置

- **全局（推荐）**：后台 → 系统设置 → 默认公众号 → 填 AppID / AppSecret / 备注名 → 保存。
- **单投票覆盖**：投票详情 → 服务号配置（留空则跟随全局）。
- 确认服务器 `.env` 的 `BASE_URL="https://cdbs.lanaoboxiang.com"`（授权回调地址用它拼，改后要 `pm2 restart huodongpeitai`）。

## 4. 验证

微信里打开投票链接 → 静默跳转一下（snsapi_base 无感授权）→ 回到投票页即可投票。大众评审绑定同理（评审页首次打开会走授权）。

## 5. 报错对照表

| 现象 | 原因与处理 |
|---|---|
| 微信自己的页面：**redirect_uri 域名与后台配置不一致 / 10003** | 第 2 步没做或填错：域名带了 `https://`、填成了带路径的地址、MP_verify 文件没生效 |
| 本系统提示：微信授权失败（**errcode=40013**） | AppID 填错（多空格/填成原始 ID 之外的东西） |
| （**errcode=40125**） | AppSecret 填错；或刚在公众号后台重置过，旧值已失效 |
| （**errcode=40029 / 40163**） | 授权 code 过期或已使用（code 一次性、5 分钟有效）→ 返回重新进入链接即可 |
| （**errcode=48001**） | 该公众号没有网页授权权限（非认证服务号）→ 见第 0 步 |
| 请在微信客户端打开链接 | 授权必须在微信里完成，用微信扫码/发送链接到微信打开 |
| 想看原始错误 | 服务器 `pm2 logs huodongpeitai` 有 `[wx] code换openid失败 ...` 明细 |

## 6. 常见问题

- **换公众号了**：AppSecret 在公众号后台重置后，系统设置里同步更新即可，即时生效。
- **一台手机多人投**：snsapi_base 拿到的 openid 是同号的同一身份，openid 维度一人一号；想再松一点可不配公众号走设备指纹。
- **测试号转正式**：测试号的 openid 与正式公众号不互通，切换后旧 openid 票记视为不同人。
