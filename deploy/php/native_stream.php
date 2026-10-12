<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

/** Example native playback resolver. Uses the same configured gateway as Web playback. */
require_once __DIR__ . '/_features.php';
require_once __DIR__ . '/music_source_adapters.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function nativeStreamError(string $message, int $status = 502): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
try {
    foreach (['source', 'id', 'quality'] as $key) if (isset($_GET[$key]) && !is_scalar($_GET[$key])) throw new InvalidArgumentException('Invalid parameter');
    $source = strtolower(trim((string)($_GET['source'] ?? 'netease')));
    if (!isset(xcloudMusicPlatforms()[$source])) throw new InvalidArgumentException('Invalid source');
    xcloudRequireSource($source);
    $id = trim((string)($_GET['id'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $id)) throw new InvalidArgumentException('Invalid song ID');
    $result = xcloudMusicResolve('url', $source, ['id' => $id, 'quality' => (string)($_GET['quality'] ?? '320')]);
    header('Location: ' . $result['url'], true, 302);
} catch (Throwable $error) {
    if ($error instanceof InvalidArgumentException) nativeStreamError('音乐请求参数无效', 400);
    nativeStreamError('当前音乐源暂时不可用', 502);
}
