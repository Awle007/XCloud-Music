<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

/** Example legacy helper: same-platform fallback now belongs to the unified gateway. */
require_once __DIR__ . '/_features.php';
require_once __DIR__ . '/music_source_adapters.php';
function xcloudNeteaseBackupPlayback(string $songId, string $quality = '320'): array {
    xcloudRequireSource('netease');
    try { return xcloudMusicResolve('url', 'netease', ['id' => $songId, 'quality' => $quality]); }
    catch (Throwable $error) { return ['url' => '']; }
}
