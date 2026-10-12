# XCloud Music · 管理后台

PHP 管理后台用于查看运行数据、维护用户账户、处理反馈和查看站内热榜。后台与 Web 播放器共用数据库与后端配置，采用 PHP Session 认证，无需独立的前端构建。

> 纯播放器部署无需启用后台。使用后台前需配置数据库并完成统一初始化；管理员登录独立于前台登录开关。

## 功能

| 模块 | 功能 | 数据来源或依赖 |
| --- | --- | --- |
| 控制台 | 用户与登录统计、客户端访问数据及趋势 | 业务数据库、登录记录、客户端访问统计 |
| 用户管理 | 查询用户、编辑用户名与邮箱、设置用户密码、维护邮箱验证状态、查看登录记录 | `users`、`login_logs` 等表 |
| 反馈处理 | 查看反馈详情与处理状态，向提交者发送回复邮件 | 反馈模块、反馈归档；回复另需 SMTP 与 PHPMailer |
| 站内热榜 | 查看站内热歌榜与更新时间 | `cache/xcloud_hot_toplist.json` |
| 管理员账户 | 修改当前管理员密码、退出登录 | `admins` 表、PHP Session |

后台展示已有业务数据，初始化不会生成访问记录、反馈或榜单。

## 环境与部署结构

后台随完整 Web 发布包部署，不应单独上传 `admin/`。需要 PHP 8.2+、`pdo_mysql`、`session` 等扩展与 MySQL/MariaDB 数据库。完整环境要求和 Web 服务配置见[部署指南](../docs/DEPLOYMENT.md)。

```text
站点根目录/
├── .env                     # 后端运行配置
├── admin/                   # 管理后台
├── php/                     # 共用后端与 PHP 依赖
├── vendor/                  # 本地浏览器组件、图标和字体
├── cache/                   # 榜单、反馈等运行数据
├── sql/                     # 初始化所需迁移文件
└── scripts/init-database.php # 统一数据库初始化入口
```

`npm run release` 将后台运行文件复制至 `release/admin/`；本说明保留在源码仓库，不进入部署目录。后台样式、图标、图表与表格组件均从站点 `/vendor/` 加载。

## 首次启用

### 1. 配置数据库与管理员

创建使用 `utf8mb4` 的数据库和专用数据库用户。在后端 `.env` 中填写配置：本地开发使用 `deploy/.env`，服务器使用发布包根目录 `.env`。

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=xcloud_music
DB_USER=your_database_user
DB_PASS=your_database_password

# 初始管理员；密码必须替换为至少 12 位的独立密码。
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-before-install

# 数据库结构统一通过 CLI 初始化。
XCLOUD_AUTO_MIGRATE=0
```

以上凭据均为占位值。初始化会拒绝管理员密码占位值。初次初始化需要数据库用户具有建表、修改结构及读写权限。

### 2. 初始化数据库

在源码根目录或服务器发布包根目录执行：

```bash
php scripts/init-database.php
```

脚本统一完成基础业务表、登录记录、管理员、访问统计及心动推荐相关结构，执行配套 SQL，并检查 19 张表，无需分别导入 SQL。

仅当 `admins` 表中没有管理员时，脚本使用配置中的初始账号创建管理员。重复执行保留已有管理员及密码；修改 `ADMIN_PASSWORD` 后重新初始化不会重置已有密码。已有管理员应登录后台修改密码。

MySQL 建表操作可能部分生效。出现错误时，根据命令输出修复配置或权限后重新执行；升级现有数据库前应备份。

`setup.php`、`check_db.php` 及 `includes/db_init.php` 不提供浏览器初始化入口，通过 HTTP 访问会被拒绝。数据库安装统一使用上述 CLI 命令。

### 3. 访问后台

| 环境 | 登录地址 |
| --- | --- |
| 本地开发，执行 `npm run dev` 后 | `http://127.0.0.1:5173/admin/login.php` |
| 本地 PHP 服务 | `http://127.0.0.1:8080/admin/login.php` |
| 服务器 | `https://example.com/admin/login.php` |

访问 `/admin/` 会在未登录时跳转至登录页。使用初始化时创建的管理员账户登录；前台普通用户账户不能用于后台登录。会话超过 30 分钟无活动后失效，需要重新登录。

## 可选模块

后台登录不要求 `XCLOUD_LOGIN_ENABLED=1`。关闭前台账户功能后，后台仍可管理已有数据；启用前台业务时再设置对应开关。

| 配置 | 用途 |
| --- | --- |
| `XCLOUD_LOGIN_ENABLED=1` | 启用前台登录与账户相关功能 |
| `XCLOUD_REGISTER_ENABLED=1` | 启用前台注册，同时要求登录模块开启 |
| `XCLOUD_HOT_TOPLIST_ENABLED=1` | 启用站内热榜生成与前台入口 |
| `XCLOUD_FEEDBACK_ENABLED=1` | 启用反馈提交、后台反馈读取与回复等接口 |

### 反馈与邮件

反馈归档位于 `cache/feedback/`，需要 PHP 服务账户可读写，且禁止通过 HTTP 直接访问。后台回复需要配置 `SMTP_*` 并安装 PHPMailer。在源码目录安装依赖后再构建发布包：

```bash
composer install --working-dir=deploy/php --no-dev --prefer-dist
npm run release
```

SMTP 当前使用 SMTPS，默认端口 465。发件地址与授权码应符合邮件服务商要求。已部署站点可在发布包根目录执行 `composer install --working-dir=php --no-dev --prefer-dist`。回复失败时，检查 PHP 日志、SMTP 凭据和服务器出站连接。

### 站内热榜

启用热榜开关并产生听歌记录后，在发布包根目录执行：

```bash
php php/update_xcloud_hot_toplist.php
```

脚本生成 `cache/xcloud_hot_toplist.json`，后台读取该缓存展示榜单。源码开发环境执行 `php deploy/php/update_xcloud_hot_toplist.php`。生成任务需要定期运行，完整参数与定时任务示例见项目 README 的「榜单脚本与定时任务」。该任务会清理 30 天前的听歌记录。

## 日常维护

- 在后台修改管理员密码；`.env` 中的 `ADMIN_PASSWORD` 仅供首次创建管理员使用。
- 更新程序时保留服务器 `.env`、数据库、`cache/` 和 `upload/`。本地重新构建发布包不会包含线上数据。
- Web 根目录指向发布包，保留随包 Nginx/Apache 配置中的私有目录访问限制，确保 PHP Session 存储位置可写。
- 音乐 API 与模块开关通过后端 `.env` 管理，后台没有对应的配置编辑页面。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 数据库连接失败或缺少表 | 核对后端 `DB_*`、数据库权限及统一初始化结果；确认 CLI 与 Web PHP 使用预期配置 |
| 初始账号无法登录 | 检查是否已有管理员；初始化不会覆盖已有账号或重置其密码 |
| 登录后反复跳回登录页 | 检查浏览器 Cookie、PHP Session 写权限及会话是否过期 |
| 页面无样式、图标或图表 | 检查 `/vendor/` 是否随完整发布包上传，静态文件是否错误回退至前端 HTML |
| 统计为空 | 确认已有对应业务记录；初始化空库不会生成统计数据 |
| 反馈接口提示模块关闭 | 检查 `XCLOUD_FEEDBACK_ENABLED`，以及 PHP 进程环境变量是否覆盖 `.env` |
| 反馈回复被拒绝 | 保持同源访问并重新登录、刷新页面；检查邮件配置及反馈处理状态 |
| 站内热榜为空或未更新 | 检查开关、听歌记录、生成任务结果及 `cache/` 权限 |

## 目录说明

```text
admin/
├── index.php          # 控制台与管理页面
├── login.php          # 管理员登录
├── logout.php         # 退出登录
├── api/               # 后台数据与操作接口
├── includes/          # 认证、用户操作与数据库初始化辅助逻辑
├── assets/            # 后台专用样式与脚本
├── setup.php          # 旧初始化文件，禁止 HTTP 访问
└── check_db.php       # 数据库检查文件，禁止 HTTP 访问
```

项目自有代码采用 MIT 许可证，浏览器组件及 PHP 依赖保留各自许可证，详见[第三方组件声明](../THIRD_PARTY_NOTICES.md)。
