<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

/** QQ 官方封面取色代理示例：固定官方主机和图片路径，禁止任意 URL 代理。 */
require_once __DIR__ . '/_features.php';
xcloudRequireSource('qq');
header('X-Content-Type-Options: nosniff');
try {
    if (!is_scalar($_GET['url'] ?? $_POST['url'] ?? '')) throw new InvalidArgumentException('Invalid cover URL');
    $parts = parse_url((string)($_GET['url'] ?? $_POST['url'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (($parts['scheme'] ?? '') !== 'https' || !($host === 'y.qq.com' || $host === 'y.gtimg.cn' || str_ends_with($host, '.qpic.cn') || str_ends_with($host, '.gtimg.com'))) throw new InvalidArgumentException('Invalid cover host');
    if (!preg_match('#/(T\d+)(?:R\d+x\d+)?M000([A-Za-z0-9_-]+)\.(?:jpe?g|png|webp)$#i', (string)($parts['path'] ?? ''), $match)) throw new InvalidArgumentException('Invalid cover path');
    $url = 'https://y.gtimg.cn/music/photo_new/' . $match[1] . 'R300x300M000' . $match[2] . '.jpg';
    $handle = curl_init($url);
    $body = '';
    curl_setopt_array($handle, [CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int {
            if (strlen($body) + strlen($chunk) > 5 * 1024 * 1024) return 0;
            $body .= $chunk;
            return strlen($chunk);
        }]);
    try { $ok = curl_exec($handle); $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE); }
    finally { curl_close($handle); }
    $size = @getimagesizefromstring($body);
    if ($ok === false || $status !== 200 || $size === false || $size[0] !== 300 || $size[1] !== 300) throw new RuntimeException('Cover unavailable');
    header('Content-Type: ' . $size['mime']);
    header('Cache-Control: public, max-age=604800, immutable');
    header('X-QQ-Cover-Size: 300x300');
    echo $body;
} catch (Throwable $error) {
    http_response_code($error instanceof InvalidArgumentException ? 400 : 502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'QQ cover unavailable or invalid request']);
}
