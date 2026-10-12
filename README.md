<div align="center">

![XCloud音乐](docs/assets/banner.svg)

**支持独立部署与扩展的多音源音乐 Web 应用。**

Vue 3 · Pinia · PHP · MySQL · MIT

[软件下载](#软件下载) · [功能](#功能) · [快速开始](#快速开始) · [音源接入](#音源接入与模块开关) · [生产部署](#生产部署) · [开发](#开发与测试) · [许可](#许可与致谢)

</div>

---

## 关于项目

XCloud音乐的网站运营已经停止，Web 版本现以完整源码开放，支持独立部署、二次开发及音源适配扩展。
软件版本仍可使用，但已不提供登录及云端保存功能，点击下方链接即可下载。

| 平台 | 下载入口 |
| --- | --- |
| Windows | [下载 Windows 桌面程序](https://github.com/Awle007/XCloud-Music/releases) |
| Android | [下载 Android APP](https://github.com/Awle007/XCloud-Music/releases) |
| iOS/Mac | 暂不支持 |

进入对应版本的 Releases 页面，在 **Assets** 中选择适合平台的安装包。上述两款软件未开源；本仓库公开的是 Web 版本源码，MIT 许可证仅适用于本仓库的项目自有代码，不涵盖这两款软件。

> **开始之前**
>
> 原站链接及第三方音乐 API 地址已替换为 `example.com` 系列示例；网易官方榜单、歌手、歌单接口，以及 QQ、酷我的官方封面地址保留。项目不提供公共播放服务，搜索、播放、歌词等功能仍需接入自己的兼容 API。页面静态资源、后台库、图标字体和默认头像均从本地加载；歌曲封面与音频按平台返回的地址加载。

## 软件下载



## 功能

| 发现音乐 | 整理曲库 | 播放体验 | 管理与维护 |
| --- | --- | --- | --- |
| 网易 / QQ / 酷我 / 酷狗适配层 | 收藏与自定义歌单 | 队列、播放模式与音质选择 | 用户管理与访问统计 |
| 搜索与音源回退 | 本地数据与账户同步 | 展开播放器与滚动歌词 | 问题反馈、回复与邮件日报 |
| 歌手详情与歌曲列表 | 听歌历史 | 歌词翻译、MV、定时停止 | 音源可用性检查 |
| 官方榜单与站内热榜 | 歌单链接 / 文本导入 | 桌面与移动端布局 | 本地广告图与跳转清单 |
| 可选心动推荐 | 登录前曲库备份与合并 | 直接下载及受限下载接口 | 本地头像，或可选 COS 存储 |

💗 **[深入了解心动模式](docs/heart-mode/README.md)** · 用户画像、多源召回、探索与熟悉歌曲的配额混排，以及不断续接的个性化播放队列。

能力是否可用取决于接入服务的协议、返回字段、媒体链接和授权范围。运行时的歌曲封面、音频与 MV 来自配置的服务，不作为静态文件附带在仓库中。

## 快速开始

随包配置模板采用纯播放器模式：保留搜索、播放、本地收藏、歌单与历史，关闭账户、心动推荐、站内热榜和反馈。该模式无需 MySQL、SMTP 或数据库初始化。

### 1. 安装构建依赖

构建环境需要 Node.js 20+（推荐 22 LTS）及 npm，服务器需要 PHP 8.2+、cURL、mbstring 和 HTTPS Web 服务。账户等可选功能另需数据库扩展及 Composer，详见[部署指南](docs/DEPLOYMENT.md)。

```bash
npm ci
```

### 2. 生成并上传发布包

```bash
npm run release
```

将 `release/` 内的文件上传到站点根目录，配置 Nginx（随包 `nginx.conf.example`）或 Apache（`.htaccess`）及 PHP。Web 根目录应指向发布目录。`npm run build` 仅生成前端。

### 3. 配置运行环境与兼容音源

在发布目录复制模板：

```bash
cp .env.production.example .env
```

模板中的登录、注册、心动推荐、站内热榜和反馈开关均为 `0`。四个平台默认开启，可按需关闭；至少保留一个已接入的平台。填写兼容音乐 API，例如：

```ini
XCLOUD_MUSIC_API_1_URL=https://music-api.example.com/api.php
XCLOUD_MUSIC_API_1_FORMAT=local
XCLOUD_MUSIC_API_1_ENABLED=1
XCLOUD_MUSIC_API_1_SOURCES=netease,kuwo,qq,kugou
```

上述地址仅为占位示例，不提供音乐服务。`local` 和 `meting` 的请求与响应契约、多个 API 的备用顺序见[音源协议指南](docs/MUSIC_API.md)。不兼容的第三方服务需要调整 PHP 适配器。

### 4. 验证并使用

打开站点，检查 `/php/public_config.php`，并逐一验证启用平台的搜索、分页、封面、播放和歌词。修改服务器 `.env` 中的功能开关或音源配置后，刷新页面即可重新加载，无需构建前端。纯播放器模式不写入匿名数据库访问统计；收藏、歌单与历史保存在浏览器本地。

浏览器播放、媒体格式、跨域及上游服务可用性需在目标部署环境中验证，源码构建不能替代实际播放验收。

### 可选：账户与完整功能

账户同步、站内热榜、心动推荐及后台数据管理需要 MySQL/MariaDB；邮件验证码、找回密码和反馈邮件另需 SMTP。启用所需模块前，填写数据库和初始管理员配置，安装 PHP 依赖并执行统一初始化：

```bash
composer install --working-dir=php --no-dev --optimize-autoloader
php scripts/init-database.php
```

预先创建 utf8mb4 数据库和独立数据库用户。初始化入口自动执行基础/后台建表逻辑及听歌历史、访问统计、推荐迁移，并检查 19 张表，无需手动导入 SQL。管理员初始密码至少 12 位；模板占位值会被拒绝。重复执行保留已有业务数据及管理员密码。MySQL DDL 可能部分生效，失败后应修复并重试。`XCLOUD_AUTO_MIGRATE` 保持 `0`。

数据库初始化不自动启用模块。按需设置 `XCLOUD_LOGIN_ENABLED=1`、`XCLOUD_REGISTER_ENABLED=1`、`XCLOUD_HOT_TOPLIST_ENABLED=1` 或 `XCLOUD_FEEDBACK_ENABLED=1`。心动模式另需画像准备，见[独立文档](docs/heart-mode/README.md)。后台部署、管理员初始化与使用方法见[管理后台说明](admin/README.md)。

### 可选：本地开发

```bash
cp deploy/.env.production.template deploy/.env
npm run dev
```

Windows PowerShell 可使用 `Copy-Item deploy/.env.production.template deploy/.env`。在 `deploy/.env` 配置兼容音源后，访问 `http://127.0.0.1:5173`；后台位于 `/admin/`，PHP 开发服务位于 `http://127.0.0.1:8080`。

根目录 `.env` 为可选的前端开发/构建配置，可从 `.env.example` 复制，也可直接修改源码默认值。`VITE_` 值会公开到浏览器，修改后需重启 Vite 或重新构建，不可存放密钥。`deploy/.env` 和服务器 `.env` 是 PHP 运行配置，不参与前端编译，进程环境变量优先。

## 音源接入与模块开关

搜索、播放、歌词、封面与健康检查通过 `/php/music_source.php` 统一处理。服务器可配置编号 1–20 的兼容 API，按编号为同一平台依次提供备用服务；平台歌曲身份仍为 `source:id`。前端不接收或公开上游地址。

| 模块 | 服务器变量 | 未配置时的默认值 / 依赖 |
| --- | --- | --- |
| 登录与云同步 | `XCLOUD_LOGIN_ENABLED` | `1`；数据库 |
| 注册 | `XCLOUD_REGISTER_ENABLED` | `1`；登录模块、数据库及验证码邮件 |
| 心动推荐 | `XCLOUD_HEART_MODE_ENABLED` | `0`；登录模块、数据库及兼容音源 |
| 站内热榜 | `XCLOUD_HOT_TOPLIST_ENABLED` | `1`；数据库生成缓存，可独立于登录读取 |
| 反馈 | `XCLOUD_FEEDBACK_ENABLED` | `1`；邮件功能另需 SMTP |
| 网易 / 酷我 / QQ / 酷狗 | `XCLOUD_SOURCE_{NETEASE,KUWO,QQ,KUGOU}_ENABLED` | 均为 `1`；兼容音乐 API |

开关严格接受 `0` / `1`。表中为代码缺省值；随包模板显式关闭五个可选业务模块，提供纯播放器起点。关闭登录时，注册和心动模式的有效状态自动为关闭，云同步停止，本地资料与已有账户凭据保留。关闭音源会隐藏选择入口并跳过自动备用，不删除已收藏歌曲。

`public_config.php` 仅公开有效功能布尔值。前端成功读取配置后挂载，失败时显示可重试状态；禁用模块的 HTTP 接口返回 `503 / FEATURE_DISABLED`，后台任务跳过并成功退出，避免先连接数据库或发送邮件。管理员登录独立于公共登录开关。

完整协议、扩展方法及旧配置迁移见 [MUSIC_API.md](docs/MUSIC_API.md)。网易官方榜单、歌手、歌单接口及 QQ/酷我官方封面仍使用独立官方接口；保留地址不代表线上可用性已验证。MV 不属于统一音乐协议，酷我 MV 可选使用 `KUWO_SOURCE_BASE` 对应的独立兼容服务。

## 榜单脚本与定时任务

榜单分为「网易官方榜单」和「XCloud 站内热榜」。生成脚本只允许命令行执行，不能通过浏览器访问运行；它们没有命令行参数。网易官方榜单遵守网易音源开关；站内热榜遵守独立热榜开关，关闭模块时任务跳过。首次部署建议先手动生成缓存，再加入定时任务。

### 脚本职责与输出

| PHP 文件（发布包路径） | 用途 | 依赖 / 输出 |
| --- | --- | --- |
| `php/update_toplist.php` | 抓取网易官方榜单及歌曲详情，更新 11 个榜单 | PHP cURL、外网访问；生成 `cache/toplist_<type>.json`，不依赖数据库或第三方音乐 API |
| `php/toplist.php?type=soaring` | 前端读取网易榜单的 HTTP 接口，无需定时执行 | 优先读取 24 小时内的缓存；缓存缺失或过期时实时请求网易官方接口 |
| `php/update_xcloud_hot_toplist.php` | 根据已登录用户近 30 天听歌记录生成站内热榜，最多 100 首 | 后端 `.env`、MySQL/MariaDB；生成 `cache/xcloud_hot_toplist.json` |
| `php/xcloud_hot_toplist.php` | 前端读取站内热榜的 HTTP 接口，无需定时执行 | 仅读取缓存；缓存不存在时返回空榜，不会自行重建 |

网易榜单 `type`：`soaring` 飙升榜、`new` 新歌榜、`original` 原创榜、`hot` 热歌榜、`rap` 说唱榜、`electronic` 电音榜、`euro_america` 欧美热歌榜、`billboard` Billboard、`beatport` 电子榜、`korean` 韩语榜、`uk` UK 榜。

站内热榜按独立听众数、播放次数、最近收听时间排序。**执行脚本还会删除 `listen_history` 表中 30 天前的记录**，启用前应核对数据保留策略；新站没有听歌记录时生成空榜。

### 手动执行与检查

在源码根目录执行：

```bash
php deploy/php/update_toplist.php
php deploy/php/update_xcloud_hot_toplist.php
```

源码的输出位于 `deploy/cache/`；运行 `npm run dev` 时通过 `/cache/` 访问。在发布包根目录执行：

```bash
php php/update_toplist.php
php php/update_xcloud_hot_toplist.php
# 检查接口返回的 data 和 updated_at
curl -fsS 'https://example.com/php/toplist.php?type=soaring'
curl -fsS 'https://example.com/php/xcloud_hot_toplist.php'
```

发布包的输出位于根目录 `cache/`。执行用户需要该目录的写权限，Web/PHP 用户需要读取权限；站内热榜还需要数据库查询、删除及首次建表权限。建议使用与 PHP 服务相同的用户执行，避免生成只有 root 可访问的文件。

### Linux / 宝塔定时任务示例

假设发布目录为 `/var/www/example.com`，PHP 为 `/usr/bin/php`，已创建并授权可写的日志目录 `/var/log/xcloud`。使用实际服务用户执行 `crontab -e`，加入：

```cron
# 网易官方榜单：每 6 小时一次；flock 防止同一脚本任务重叠
0 */6 * * * /usr/bin/flock -n /var/www/example.com/cache/.netease-toplist.lock /usr/bin/php /var/www/example.com/php/update_toplist.php >> /var/log/xcloud/netease-toplist.log 2>&1
# 站内热榜：每 6 小时第 10 分钟更新
10 */6 * * * /usr/bin/flock -n /var/www/example.com/cache/.xcloud-hot.lock /usr/bin/php /var/www/example.com/php/update_xcloud_hot_toplist.php >> /var/log/xcloud/xcloud-hot.log 2>&1
```

`flock` 来自 Linux 的 util-linux，请确认其路径；PHP 路径可通过 `command -v php` 查询。使用宝塔时选择「Shell 脚本」任务，每 6 小时执行一次，在脚本内容中填写上述 PHP 命令和绝对路径，两个任务错开 10 分钟；不要填写五段 cron 时间表达式。确认面板使用的 PHP CLI 版本与扩展正确。

Windows 本地开发可以使用「任务计划程序」：程序填写 `php.exe` 的绝对路径，参数填写 `"D:\your-project\deploy\php\update_toplist.php"`，触发器设置为每 6 小时；站内热榜另建任务并替换脚本名。

### 排错与任务验收

- 出现「未找到榜单数据」时检查网易响应及抓取页面结构；网络、访问限制或页面变化可能影响解析。
- 出现数据库错误时检查后端 `.env`、初始化结果和任务用户权限，不要把数据库配置写到前端 `.env`。
- 查看日志、缓存文件修改时间及 JSON 的 `updated_at`、`data`。网易批量脚本会逐榜打印成功/失败，**退出码为 0 不代表每个榜单都成功**；失败的榜单不会主动删除已有缓存。
- 健康检测、用户画像和反馈日报等其他任务见[部署指南](docs/DEPLOYMENT.md#定时任务)。

## 生产部署

### 构建完整站点

```bash
npm test
npm run release
npm run check:opensource
```

开源仓库包含完整源码、开发工具、文档与许可证。`release/` 是构建后用于上传服务器的部署目录，包含前端产物、`php/`、`admin/`、`api_check/`、`sql/`、本地静态资源、初始化命令、配置示例和 SHA-256 文件清单；项目说明、项目许可证与第三方组件清单保留在仓库，依赖自身许可证保留在部署产物中。发布脚本先在临时目录组装，成功后替换已有产物；它不会复制开发配置、上传头像或运行缓存，也不会继承旧 release 中临时添加的广告图。

将 **release 目录内的文件** 上传到站点根目录，并在服务器上执行：

```bash
cp .env.production.example .env
# 编辑 .env：填写兼容音源及所需模块开关
# 账户等可选功能另按部署指南安装依赖与初始化数据库
```

Web 根目录指向生成的发布目录，**不要指向整个源码仓库**。Nginx 参考随包 `nginx.conf.example`，修改域名、目录、PHP-FPM socket，再配置自己的 HTTPS 证书；Apache 使用 `.htaccess`，启用 rewrite/headers 并允许站点覆盖规则。

生产环境给予 Web/PHP 用户对 `cache/`、`upload/avatars/` 的写权限；`.env` 仅服务账户可读。升级已有部署时保留服务器自己的 `.env`、缓存与上传文件，不要用空目录覆盖用户数据。

完整说明与上线检查见 [部署指南](docs/DEPLOYMENT.md)。`npm run preview` 只预览前端，不能替代 PHP 生产服务。

### 邮件、头像与可选功能

<details>
<summary><strong>SMTP 与反馈邮件</strong></summary>

在后端 `.env` 填写 `SMTP_HOST`、`SMTP_USERNAME`、`SMTP_PASSWORD`、`SMTP_PORT`、`SMTP_FROM_ADDRESS`、`SMTP_FROM_NAME`；反馈日报还需要 `FEEDBACK_RECIPIENT_EMAIL`。当前发送配置使用 SMTPS，默认端口 465；使用其他加密方式时同步调整 PHPMailer 配置。

验证码注册、找回密码和反馈回复需要可用的 SMTP。反馈按日期写入私有 `cache/feedback/`，部署示例禁止 Web 读取该目录。

</details>

<details>
<summary><strong>头像与静态资源</strong></summary>

默认 `AVATAR_STORAGE=local`，用户头像写入 `upload/avatars/`，默认头像位于 `/avatars/`。`VITE_AVATAR_CDN_BASE_URL` 默认留空，前端使用同源路径。需要 `gd` 扩展才能重新编码上传图片。

可选 COS 模式：设置 `AVATAR_STORAGE=cos`、`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_REGION`、`COS_BUCKET` 及 `AVATAR_CDN_BASE_URL`，并同步设置前端头像地址前缀。默认头像也需上传到相应对象前缀；默认部署使用本地存储。

后台脚本、Bootstrap Icons 字体、DataTables 中文包均位于 `public/vendor/`；加载动画图片位于 `public/loader-img/`。更新这些库时同时保留许可证。

</details>

<details>
<summary><strong>推荐、定时任务与广告</strong></summary>

心动推荐默认关闭。完成统一初始化和音源验证后，在发布包根目录执行：

```bash
php php/rebuild_heart_mode.php --mode=global --force
php php/rebuild_heart_mode.php --mode=users --force
```

准备阶段需设置 `XCLOUD_LOGIN_ENABLED=1`；`--force` 允许在心动模块关闭时首次重建。随后在后端 `.env` 设置 `XCLOUD_HEART_MODE_ENABLED=1`。日常定时任务不使用 `--force`，遵守功能开关。源码运行时将上述 `php/` 路径换成 `deploy/php/`。登录用户的本地收藏、历史和歌单去重后至少有 10 首歌曲时，首页显示心动模式切换入口；个性化画像还需要这些数据同步到服务端。

**[心动模式独立文档](docs/heart-mode/README.md)**：从画像、四组召回、配额与去重到底层代码、接口、定时任务和排错。文档保留在源码仓库中。

生产环境可为榜单、画像、健康检测和反馈日报配置定时任务；具体示例见 [部署指南](docs/DEPLOYMENT.md#定时任务)。开发环境的脚本路径在 `deploy/php/`，生产包则在 `php/`。

广告通过 `public/ad-img/manifest.json` 配置，本地图片分别放入 desktop_sidebar / mobile_banner。每项填写图片文件名和自己的 HTTPS 跳转地址。增加广告后重新构建；当前示例链接都指向 example。

GitHub 仓库入口在桌面端位于主题切换按钮左侧，移动端保留首页原有入口，两处均使用本地 GitHub Logo。默认指向 `Awle007/XCloud-Music`；在前端 `.env` 中设置 `VITE_GITHUB_REPOSITORY_URL` 可覆盖，显式留空则显示待补充状态。修改后重启开发服务或重新构建。返回旧版的按钮及旧版跳转逻辑已移除。社群与更新日志仍为示例链接，可在 `GroupChatCard.vue`、`MeView.vue` 中替换。

</details>

## 项目结构

```text
.
├── src/                 # Vue 页面、组件、Pinia、服务与 Web 测试
├── public/              # 同源图片、广告清单、第三方静态库和字体
├── admin/               # PHP 管理后台
├── api_check/           # 音源状态页面与定时检测
├── deploy/
│   ├── php/             # PHP 接口源码、Composer 清单
│   ├── sql/             # 统计和推荐迁移
│   └── *.example        # 服务器配置及环境示例
├── scripts/             # 启动、打包、初始化、PHP 测试
├── docs/                # 部署指南、协议说明和历史设计文档
├── .env.example         # 公开的前端配置模板
└── release/             # npm run release 生成；不提交到源码仓库
```

PHP 为文件式接口，前端和后台同源部署。收藏、歌单、历史和偏好由 `legacyStorage` 协调；调整存储键、歌曲 source + id 身份或同步行为时，请保留既有数据兼容性。

## 开发与测试

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | PHP + Vite 开发环境 |
| `npm run dev:vite` | 仅前端开发服务器 |
| `npm test` | 当前 Web 范围的 Vitest 测试 |
| `npm run build` | 仅前端构建到 dist |
| `npm run release` | 完整站点打包到 release |
| `npm run check:opensource` | 检查旧地址和远程静态资源残留 |
| `php scripts/local-avatar.test.php` | 本地头像存储及路径校验 |
| `php scripts/feedback_admin_security_test.php` | 后台反馈权限辅助逻辑 |
| `php scripts/provider_upstream_contract_test.php` | 音源适配源码契约 |

部分 PHP 测试需要本地模拟 HTTP 服务或 SQLite，请先阅读对应脚本。

## 常见问题

**页面能打开，搜索和播放却失败？** 
先检查是否仍在使用 example 地址，再确认请求方法和返回格式匹配；不要通过删除错误提示来掩盖上游故障。

**注册邮件收不到？** 
检查 PHPMailer 安装、SMTPS 配置、发件地址权限、服务器出站端口和 PHP 日志。

**头像上传失败？** 
确认 GD/fileinfo 扩展启用，上传文件为 JPG/PNG、大小不超过 2 MB，且 `upload/avatars/` 可写。

**刷新子路由出现 404？** 
配置 SPA 回退，静态文件和 `/php`、`/admin`、`/api_check` 仍按真实路径处理。

**新域名下看不到原有本地收藏？** 
浏览器 localStorage 与源绑定，不会自动跨域迁移；账户数据仍以服务器数据库为准。

## 许可与致谢

项目自有代码采用 [MIT License](LICENSE)。第三方库保留各自许可证，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

欢迎通过 Issue 反馈可复现的问题，通过 Pull Request 改进代码与文档。提交前运行相关测试，并保留配置模板中的示例值；请不要提交个人密钥、真实用户数据或生产音源地址。
