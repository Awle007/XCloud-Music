# 统一音乐 API 接入指南

音乐网关将搜索、播放地址、歌词、封面及健康检查统一为同源 PHP 接口。上游服务由服务器 `.env` 配置，普通音乐请求不依赖数据库。本文中的 API 地址和歌曲均为示例，不提供公共音乐服务，也不保证示例可播放。

## 配置与备用顺序

```ini
XCLOUD_MUSIC_API_1_URL=https://music-api.example.com/api.php
XCLOUD_MUSIC_API_1_FORMAT=local
XCLOUD_MUSIC_API_1_ENABLED=1
XCLOUD_MUSIC_API_1_SOURCES=netease,kuwo,qq,kugou

XCLOUD_MUSIC_API_2_URL=https://backup-api.example.com/api.php
XCLOUD_MUSIC_API_2_FORMAT=meting
XCLOUD_MUSIC_API_2_ENABLED=1
XCLOUD_MUSIC_API_2_SOURCES=netease,qq
```

编号支持 `1`–`20`。`URL` 为空时跳过该组；`FORMAT` 默认为 `local`，仅内置 `local` / `meting`；`ENABLED` 默认为 `1`，严格接受 `0` / `1`；`SOURCES` 默认为 `netease,kuwo,qq,kugou`，填写实际支持的平台 ID，以逗号分隔。

网关按编号尝试启用且支持目标平台的提供商，服务异常或响应不符合契约时尝试下一组。备用服务仍属于同一音乐平台，歌曲身份保留 `source:id`，不能把网易歌曲 ID 当作 QQ ID 使用。关闭平台开关 `XCLOUD_SOURCE_<平台大写>_ENABLED=0` 后，该平台不参与请求或自动备用。

单个上游请求最多等待 18 秒，整组备用尝试共享 45 秒预算；预算耗尽时停止继续请求。有效的空搜索、空歌词或空封面会继续尝试备用组，最终仍为空时返回空结果。

兼容协议才能通过配置 URL 接入。第三方 API 的认证方式、参数、分页或响应字段不符合以下契约时，需要修改适配器；更换域名不会自动完成兼容。

## 前端统一入口

向 `/php/music_source.php` 发送 JSON POST：

```bash
curl -X POST 'https://example.com/php/music_source.php' \
  -H 'Content-Type: application/json' \
  --data '{"action":"search","source":"netease","keyword":"示例歌手","page":1,"limit":30}'
```

| 字段 | 契约 |
| --- | --- |
| `action` | `search`、`url`、`lyric`、`cover`、`health`、`similar` |
| `source` | `netease`、`kuwo`、`qq`、`kugou` |
| `keyword` | 搜索必填，最多 200 字符；健康检查可指定检测关键词 |
| `page` | 从 1 开始，范围 1–1000，默认 1 |
| `limit` | 范围 1–100，默认 30 |
| `id` | `url` / `lyric` / `cover` / `similar` 必填；平台歌曲 ID（播放、歌词可用对应 `url_id` / `lyric_id`） |
| `pic_id` | 封面查询可选，填写搜索返回的图片资源 ID；直接图片 URL 可直接展示，无需查询 |
| `quality` | 可选 `128` / `192` / `320` / `999`，默认 `320`；实际音质取决于上游 |

搜索响应为 `{"data":[...]}`，每首歌曲包含 `id`、`url_id`、`lyric_id`、`source`、`name`、`artist`、`album`、`pic_id`、`duration`。播放响应包含 `url`、`source`、`br`、`type` 等字段；歌词响应为 `{"lyric":"...","tlyric":"..."}`；封面响应含 `pic` 与 `url`。`pic_id` 可以是图片 URL，也可以是数字或其他封面资源 ID，客户端应保留它，并通过 `cover` 查询实际图片地址。

两种内置协议均没有相似歌曲契约，`similar` 返回 `{"data":[]}`，不会虚构推荐结果。心动模式继续依赖歌手搜索、画像候选等其他召回路径。`health` 以搜索检测协议是否可用，成功返回 `{"ok":true}`，不代表音频链接、全部歌曲或所有音质可播放。

禁用平台返回 HTTP `503` 与 `FEATURE_DISABLED`；非法参数返回 `400`；上游无法完成请求返回 `502` 和通用错误信息。客户端不能传入上游 URL；网关只请求服务器配置的地址，不在公开配置和错误中暴露私密服务参数。

## `local` 协议

此协议参考独立 PHP 音乐服务的 `api` 参数格式。网关向配置 URL 发起带查询参数的 GET 请求，`source` 使用中文平台名：`网易云音乐`、`酷我音乐`、`QQ音乐`、`酷狗音乐`。

| 操作 | 上游查询参数 | 必需响应结构 |
| --- | --- | --- |
| 搜索 / 健康检查 | `api=search_with_source&key=关键词&pn=1&source=中文平台名` | `{"code":0,"data":{"songs":[...]}}` |
| 播放地址 | `api=get_song_with_source&id=歌曲ID&source=中文平台名` | `{"data":[{"url":"https://audio.example.com/demo.m4a","type":"m4a","ts":"HQ"}],"gc":"歌词","pic":"https://images.example.com/demo.jpg"}` |
| 歌词 | `api=get_lyrics_with_source&id=歌曲ID&source=中文平台名` | `{"gc":"[00:00.00]示例歌词"}` |
| 封面 | 与播放地址相同的 `get_song_with_source` 请求 | 顶层 `pic` 为图片 URL |

搜索歌曲字段为 `rid`、`name`、`artist`、`album`、`pic`、`duration`。`rid` 是平台歌曲 ID；`artist` 可以是字符串或数组。该协议仅传递页码，没有统一的上游分页条数参数，实际每页数量取决于服务。

播放的 `data` 可含多个音频候选。适配器根据 `type` / `ts` 估算音质档位并选择候选，`999` 表示最高/无损请求档位，不承诺实际码率；不会通过改扩展名将 M4A 或 FLAC 变成 MP3。媒体 MIME、容器和浏览器支持仍需实测。

播放响应中的 `gc` 可以为空或仅包含歌曲说明。前端仅复用可解析的带时间轴歌词；歌曲说明不会阻止独立歌词请求。独立歌词通过 `api=get_lyrics_with_source&id=歌曲ID&source=中文平台名` 获取，读取响应中的 `gc`。

## `meting` 协议

此处为明确的 `types` 查询协议，不代表所有名为 Meting 的部署均兼容。`source` 使用平台 ID。

| 操作 | 上游查询参数 | 响应结构 |
| --- | --- | --- |
| 搜索 / 健康检查 | `types=search&source=netease&name=关键词&pages=1&count=30&limit=30` | JSON 数组，每项含 `id/name/artist/album/pic_id` |
| 播放地址 | `types=url&source=netease&id=歌曲ID&br=320&size=300` | `{"url":"https://audio.example.com/demo.mp3","br":320,"type":"mp3"}` |
| 歌词 | `types=lyric&source=netease&id=歌曲ID&br=320&size=300` | `{"lyric":"...","tlyric":"..."}` |
| 封面 | `types=pic&source=netease&id=封面ID&br=320&size=300` | `{"url":"https://images.example.com/demo.jpg"}` |

搜索同时传递 `count` 与 `limit`，范围为 1–100。数字 `pic_id` 是资源标识，不能因其不是 URL 而丢弃。封面请求应使用搜索返回的 `pic_id`，播放与歌词可使用对应的 `url_id` / `lyric_id`（缺省与歌曲 ID 相同）。

统一封面操作同时携带歌曲 `id` 和图片 `pic_id`：`local` 使用歌曲 ID，`meting` 优先使用图片 ID，未提供时才回退到 `id`。例如 `{"action":"cover","source":"netease","id":"42","pic_id":"109951170045577565"}`，两种协议切换时不会将图片 ID 误当成歌曲 ID。

## 扩展与旧配置迁移

适配逻辑位于源码 `deploy/php/music_source_adapters.php`（发布包 `php/music_source_adapters.php`）：`xcloudMusicQuery()` 生成查询参数，`xcloudMusicNormalize()` 将响应转换为统一字段。新增协议还需在提供商格式校验中注册，并补充本地模拟上游测试。涉及自定义认证或请求方法时同步调整请求层，密钥始终留在服务器。

统一 `XCLOUD_MUSIC_API_<编号>_*` 配置替代旧的 `VITE_PUBLIC_MUSIC_API`、`VITE_COVER_SOURCE_BASE`、`QQ_SOURCE_UPSTREAM_BASE`、`KUGOU_SOURCE_BASE`、`NETEASE_SOURCE_BASE`、`NETEASE_BACKUP_PLAY_URL`、`PUBLIC_MUSIC_API`。前端仅配置同源 PHP 路径，不再配置音乐上游。

`KUWO_SOURCE_BASE` 仅保留为可选独立 MV 示例服务；上述两种统一协议不提供 MV。网易官方榜单/歌手/歌单和官方封面接口继续独立运行，并遵守平台开关。原生音频解析使用统一网关，不再要求填写 `XCLOUD_PUBLIC_ORIGIN`；该变量可保留作站点地址兼容配置。

健康检测任务 `api_check/check_api_schedule.php` 为 CLI 入口，使用统一网关，无需另设检测服务 URL。部署后应验证本地数据保留、各平台的搜索与分页、封面 ID 解析、歌词、媒体格式、实际播放、下载和同平台备用；仅构建通过不能证明真实服务可用。
