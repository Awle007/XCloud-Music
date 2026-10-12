<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

require_once __DIR__ . '/_env.php';

const XCLOUD_DOWNLOAD_LIMIT = 262144000;

function downloadError(string $message, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function allowedDownloadHosts(): array
{
    $configured = trim((string)xcloudEnv('XCLOUD_DOWNLOAD_ALLOWED_HOSTS', ''));
    if ($configured !== '') return array_values(array_filter(array_map('trim', explode(',', strtolower($configured)))));
    return ['.music.126.net', '.qqmusic.qq.com', '.gtimg.com', '.kugou.com', '.kuwo.cn', '.audio.example.com'];
}

function hostAllowed(string $host): bool
{
    $host = strtolower(rtrim($host, '.'));
    foreach (allowedDownloadHosts() as $allowed) {
        $allowed = strtolower(rtrim($allowed, '.'));
        if ($allowed === '') continue;
        if ($allowed[0] === '.' && ($host === substr($allowed, 1) || str_ends_with($host, $allowed))) return true;
        if ($host === $allowed) return true;
    }
    return false;
}

function publicHost(string $host): bool
{
    $records = dns_get_record($host, DNS_A | DNS_AAAA);
    if (!is_array($records) || !$records) return false;
    foreach ($records as $record) {
        $ip = (string)($record['ip'] ?? $record['ipv6'] ?? '');
        if ($ip === '' || filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) return false;
    }
    return true;
}

function validateDownloadUrl(string $url): array
{
    $parts = parse_url($url);
    if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https') downloadError('仅支持 HTTPS 音频地址', 400);
    if (isset($parts['user']) || isset($parts['pass'])) downloadError('下载地址格式无效', 400);
    if (isset($parts['port']) && (int)$parts['port'] !== 443) downloadError('下载地址端口不受支持', 400);
    $host = (string)($parts['host'] ?? '');
    if ($host === '' || !hostAllowed($host) || !publicHost($host)) downloadError('该音频地址不在允许范围内', 403);
    return $parts;
}

$url = trim((string)($_GET['url'] ?? ''));
$filename = basename((string)($_GET['filename'] ?? 'music.mp3'));
if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) downloadError('无效的下载地址', 400);
validateDownloadUrl($url);

$filename = trim(preg_replace('/[\x00-\x1F\x7F\\\/:*?"<>|]+/u', '_', $filename)) ?: 'music.mp3';
$fallbackName = preg_replace('/[^\x20-\x7E]/', '_', $filename);
$received = 0;
$contentType = '';
$headersSent = false;

$curl = curl_init($url);
curl_setopt_array($curl, [
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 180,
    CURLOPT_USERAGENT => 'XCloud-Music-Download/3.0',
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_HEADERFUNCTION => function ($curl, string $header) use (&$contentType): int {
        if (stripos($header, 'Content-Type:') === 0) $contentType = strtolower(trim(substr($header, 13)));
        if (stripos($header, 'Content-Length:') === 0 && (int)trim(substr($header, 15)) > XCLOUD_DOWNLOAD_LIMIT) return 0;
        if (stripos($header, 'Location:') === 0) return 0;
        return strlen($header);
    },
    CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (&$received, &$contentType, &$headersSent, $filename, $fallbackName): int {
        if (!$headersSent) {
            if ($contentType !== '' && !str_starts_with($contentType, 'audio/') && !str_starts_with($contentType, 'application/octet-stream')) return 0;
            header('Content-Type: ' . ($contentType ?: 'application/octet-stream'));
            header('Content-Disposition: attachment; filename="' . addslashes($fallbackName) . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
            header('Cache-Control: private, no-store');
            header('X-Content-Type-Options: nosniff');
            $headersSent = true;
        }
        $received += strlen($chunk);
        if ($received > XCLOUD_DOWNLOAD_LIMIT) return 0;
        echo $chunk;
        return strlen($chunk);
    },
]);

$ok = curl_exec($curl);
$status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_error($curl);
curl_close($curl);

if (!$headersSent && ($ok === false || $status < 200 || $status >= 300)) {
    error_log('Secure download failed: status=' . $status . ' error=' . $error);
    downloadError('音频下载失败，请稍后重试', 502);
}
