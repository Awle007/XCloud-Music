# XCloud Music 部署指南

本指南适用于 XCloud Music 的独立 Web 部署。纯播放器模式无需 MySQL、SMTP 或数据库初始化；账户、站内热榜、心动推荐等为可选模块。音乐 API 模板仅包含占位示例，实际接入契约见 [MUSIC_API.md](MUSIC_API.md)。网易官方榜单使用独立官方接口，遵守网易音源开关。

## 构建与发布

最小部署流程：安装构建依赖 → 生成并上传发布包 → 配置 PHP 运行环境与兼容音源 → 在目标浏览器验证。启用账户等模块时，再安装 PHP 邮件依赖并初始化数据库。

`deploy/` 包含发布构建所需的 PHP、SQL、服务器配置和后端环境模板。前端配置支持修改源码默认值，或通过源码根目录 `.env` 的 `VITE_` 变量覆盖；变量在构建时写入 JavaScript，配置文件不随发布包部署。

在源码目录执行：

```bash
npm ci
npm test
npm run release
npm run check:opensource
```

完整源码与文档在仓库中维护；`release/` 仅包含用于上传服务器的部署产物，不复制项目文档与项目许可证。依赖自身许可证保留，SHA-256 文件清单位于 `release-manifest.json`。第三方库、字体、默认头像、加载动画和广告图均使用本地文件。广告素材的构建输入目录为 `public/ad-img/`。

部署包保留当前已安装的 PHP vendor。纯播放器无需邮件依赖；启用邮件等功能时，可在构建前执行 `composer install --working-dir=deploy/php --no-dev --optimize-autoloader`，或在发布目录执行 `composer install --working-dir=php --no-dev --optimize-autoloader`。

## 纯播放器运行配置

将 release 内容上传到一个新的版本目录，在该目录执行：

```bash
cp .env.production.example .env
```

站点根目录 `.env` 为 PHP 运行配置。模板显式设置以下纯播放器开关：

```ini
XCLOUD_LOGIN_ENABLED=0
XCLOUD_REGISTER_ENABLED=0
XCLOUD_HEART_MODE_ENABLED=0
XCLOUD_HOT_TOPLIST_ENABLED=0
XCLOUD_FEEDBACK_ENABLED=0
XCLOUD_SOURCE_NETEASE_ENABLED=1
XCLOUD_SOURCE_KUWO_ENABLED=1
XCLOUD_SOURCE_QQ_ENABLED=1
XCLOUD_SOURCE_KUGOU_ENABLED=1
```

保持至少一个已接入的平台开启，填写 `XCLOUD_MUSIC_API_1_URL`、`FORMAT`、`ENABLED`、`SOURCES`。可配置编号 1–20，按编号在同一平台内备用；仅内置 `local` / `meting` 协议，不兼容服务需修改适配器。详见 [MUSIC_API.md](MUSIC_API.md)。纯播放器不会连接账户数据库或写入匿名数据库访问统计，无需填写数据库、管理员或 SMTP 配置。

全部开关严格接受 `0` / `1`；未显式配置时，代码默认心动模式为 `0`，其余八项为 `1`。修改服务器 `.env` 后刷新页面即可，无需重新构建。PHP 公开入口 `/php/public_config.php` 仅返回有效功能布尔值，不暴露服务 URL 或密钥。前端加载成功后挂载；加载失败可重试。

关闭登录会同时关闭注册与心动模式的有效状态、停止云同步，保留本地资料和账户凭据。站内热榜独立于登录，可继续读取已有缓存；管理员登录也独立于公共登录开关。关闭平台会隐藏入口、拒绝对应 API 并跳过自动备用，保留已有歌曲数据。禁用 HTTP 接口返回 `503 / FEATURE_DISABLED`，相应 CLI 任务跳过并成功退出，守卫先于数据库连接及邮件发送。

`KUWO_SOURCE_BASE` 仅供可选独立酷我 MV 服务使用，统一音乐协议不提供 MV；`XCLOUD_PUBLIC_ORIGIN` 可留空，统一原生解析无需配置本站地址。

本地 PHP 开发使用 `deploy/.env`，该文件不纳入发布构建。后端读取配置时，进程环境变量优先。数据库安装通过 CLI 完成，`XCLOUD_AUTO_MIGRATE` 保持为 `0`。版本更新应保留服务器原有 `.env`。

## 可选：账户与数据库模块

账户同步、心动推荐、站内热榜生成及后台数据管理需要数据库。注册验证码、找回密码、反馈回复与日报另需 SMTP 和 PHPMailer；当前 SMTP 使用 SMTPS，默认端口 465。PHP 启用 `pdo_mysql`、`session`、`openssl`；头像上传另需 `gd`、`fileinfo`。数据库建议 MySQL 8 或 MariaDB 10.6+，需按目标版本验收。

创建 utf8mb4 数据库，授予独立数据库用户相应权限，填写 `.env` 的 `DB_*`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`，再运行：

```bash
php scripts/init-database.php
```

初始化脚本调用基础及后台建表逻辑，自动执行 `sql/listen_history.sql`、`sql/client_entry_stats.sql` 和 `sql/2026-09-09-heart-mode.sql`，并检查全部 19 张表。脚本输出中文进度，失败时返回非零退出码；MySQL DDL 可能部分生效，修复后可重新执行。

`ADMIN_PASSWORD` 至少 12 位，模板占位值不可使用。重复初始化保留已有业务数据和管理员密码，后续密码变更通过管理后台完成。心动模式的画像重建与启用步骤见[心动模式说明](heart-mode/README.md)。

初始化不自动开启可选功能。完成数据库及必要邮件验证后，按需开启登录、注册、站内热榜、反馈；心动模式按独立文档先准备画像。首次初始化需要建表与修改结构权限。数据库版本兼容性及已有数据库升级应先在测试库中验证，并保留迁移前备份。

## Web 服务

Nginx 使用随包 nginx.conf.example：

1. 替换 server_name、root 和 PHP-FPM socket。
2. 示例先使用 HTTP 80 端口；按服务器环境另行启用 HTTPS、配置证书和 HTTP 跳转。
3. Web 根目录指向生成的发布目录，不能指向整个源码仓库。
4. 保留点文件、私有反馈/限流缓存、后台 include 和 CLI scripts 的禁止访问规则。
5. 执行 `nginx -t` 检查配置，再重载服务。

Apache 使用随包 `.htaccess`，需启用 `mod_rewrite`、`mod_headers` 并允许站点覆盖规则。Nginx 使用独立配置文件。

Vue 页面使用 history 路由，需要对不存在的页面路径回退 index.html，同时保留实际 PHP 和静态文件路径。全站同源部署能让前端、后台和账户接口使用一致的权限与存储环境。

后台及状态页包含既有内联脚本，示例 CSP 为兼容它们允许 unsafe-inline。进一步收紧策略时须按路由迁移内联脚本或添加 nonce，并在浏览器中验收后台操作。示例不加载第三方脚本域名。

## 目录权限与持久化

| 路径 | 内容 | 要求 |
| --- | --- | --- |
| `.env` | 后端秘密配置 | 仅服务账户可读，HTTP 不可访问 |
| `cache/` | 公开榜单及部分私有缓存 | PHP 可写，按子目录划分公开性 |
| `cache/feedback/` | 反馈内容、邮箱和回复状态 | HTTP 禁止访问 |
| `cache/rate_limits/` | 限流状态 | HTTP 禁止访问 |
| `upload/avatars/` | 用户图片 | PHP 可写，可读图片，禁止执行脚本 |
| `api_check/` | 健康检查生成文件 | 定时任务账户需要对输出位置有写权限 |
| `php/vendor/`、静态资源 | 依赖与程序文件 | 服务账户可读，通常无需写权限 |

写权限按目录用途分配。版本更新应保留 `.env`、`cache/`、`upload/` 和数据库，可通过版本目录切换或持久化目录挂载部署。发布构建不包含线上数据迁移。

默认头像位于 avatars/，浏览器使用本地路径；本地头像上传需要 GD 和 fileinfo。COS 仅为可选存储模式，若开启，应自行上传默认头像并配置对象地址前缀。迁移旧 COS 数据到本地不由部署脚本自动执行。

## 定时任务

以下 Linux crontab 示例中的 PHP 二进制和发布路径应按环境调整，执行用户需具有相应数据目录的写权限。配置前应逐项手动验证。所有日常任务尊重开关，关闭模块时跳过；不得在日常 cron 添加 `--force`。网易官方榜单直接请求官方接口，不依赖数据库，依赖网易音源开关；站内热榜生成依赖数据库与独立热榜开关。音源检测通过统一网关调用兼容上游，无需单独配置检测 URL，禁用平台会跳过。

榜单脚本的参数、缓存位置、Linux/宝塔/Windows 任务示例和排错方法见源码仓库 README 的「榜单脚本与定时任务」。站内热榜脚本还会删除 30 天前的听歌记录，启用前确认数据保留策略。

```cron
# 官方榜单与站内热榜
0 */6 * * * /usr/bin/php /var/www/example.com/php/update_toplist.php
10 */6 * * * /usr/bin/php /var/www/example.com/php/update_xcloud_hot_toplist.php
# 音源检测
*/30 * * * * /usr/bin/php /var/www/example.com/api_check/check_api_schedule.php
# 可选：心动推荐统计与用户画像
20 */6 * * * /usr/bin/php /var/www/example.com/php/rebuild_heart_mode.php --mode=global
40 */6 * * * /usr/bin/php /var/www/example.com/php/rebuild_heart_mode.php --mode=users
# 可选：反馈日报
0 12 * * * /usr/bin/php /var/www/example.com/php/send_feedback_digest.php
```

心动推荐首次准备：完成初始化 → 配置兼容上游并设置 `XCLOUD_LOGIN_ENABLED=1` → 在心动开关仍为 `0` 时执行：

```bash
php php/rebuild_heart_mode.php --mode=global --force
php php/rebuild_heart_mode.php --mode=users --force
```

`--force` 仅绕过心动模式开关，登录模块仍必须开启。随后设置 `XCLOUD_HEART_MODE_ENABLED=1`，验证认证推荐请求；日常任务使用上方无 `--force` 的命令。关闭时改回 `0`，无需删除推荐表。

## 发布检查

- `/`、`/search`、`/favorites` 刷新正常，静态资源和字体请求无 404。
- `/admin/login.php` 样式、图标、图表、表格中文均从本地资源加载。
- `/.env`、`/php/config.php`、`/php/_env.php`、`/admin/includes/`、`/scripts/` 和私有 cache 不可通过 HTTP 读取。
- 未认证访问收藏、歌单、历史或账户修改接口应被拒绝。
- 纯播放器验证本地收藏、歌单、历史及关闭登录后资料保留；启用账户后再用测试账户验证注册、验证码、登录、同步和退出。
- 对每个启用音源验证搜索、分页、播放、歌词、封面和下载；媒体 MIME/容器兼容性仍需实测。
- 启用反馈时提交测试反馈，确认后台可查看/回复，归档不能被公开下载；关闭时接口应返回禁用状态。
- 启用账户上传时测试 JPG/PNG，确认本地保存、默认头像和旧头像处理正常。
- 在无 DB/SMTP 的纯播放器配置下请求禁用账户、推荐、反馈等接口，确认返回禁用状态，检查 CLI 跳过状态。

上述检查应在目标部署环境中完成，覆盖实际数据库、SMTP 和上游服务。

## 回滚

应用回滚通过切换至上一发布目录及配置完成，运行数据保持持久化。涉及数据库结构变更时，应根据迁移记录和备份制定独立的数据回滚方案。
