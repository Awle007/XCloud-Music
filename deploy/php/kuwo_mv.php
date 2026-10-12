<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */


require_once __DIR__ . '/_features.php';
xcloudRequireSource('kuwo');
// 上游协议示例：mvapi.php?msg={keyword}&p={page}&n={index}；KUWO_SOURCE_BASE 示例地址不能直接用于生产，需配置兼容服务。

require_once __DIR__ . '/_env.php';


define('KUWO_MV_BASE', xcloudEnv('KUWO_SOURCE_BASE', 'https://upstream.example.com/music/kw'));

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($input)) $input = $_POST;
$action = strtolower(trim((string)($input['action'] ?? 'search')));
$keyword = trim((string)($input['all'] ?? $input['keyword'] ?? ''));
$page = max(1, (int)($input['pn'] ?? $input['page'] ?? 1));
if ($keyword === '') kuwoMvJson(['success' => false, 'message' => 'missing keyword'], 422);

try {
    if ($action === 'url') {
        $body = kuwoMvRequest('/mvapi.php', ['msg' => $keyword, 'p' => $page, 'n' => max(1, (int)($input['n'] ?? 1))]);
        $url = kuwoMvFindUrl($body);
        kuwoMvJson(['success' => $url !== '', 'url' => $url], $url === '' ? 502 : 200);
    }

    $data = kuwoMvRequest('/mvsearch.php', ['msg' => $keyword, 'p' => $page]);
    $items = is_array($data['data'] ?? null) ? $data['data'] : (is_array($data['list'] ?? null) ? $data['list'] : []);
    $results = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $results[] = [
            'name' => trim((string)($item['name'] ?? $item['title'] ?? '')),
            'artist' => trim((string)($item['artist'] ?? $item['singer'] ?? '')),
            'cover' => trim((string)($item['pic'] ?? $item['cover'] ?? '')),
        ];
    }
    kuwoMvJson($results);
} catch (Throwable $e) {
    error_log('kuwo mv failed: ' . $e->getMessage());
    kuwoMvJson(['success' => false, 'message' => 'Kuwo MV source unavailable'], 502);
}

function kuwoMvRequest(string $path, array $query): array|string
{
    $url = KUWO_MV_BASE . $path . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15, CURLOPT_NOPROXY => '*', CURLOPT_HTTPHEADER => ['Accept: application/json, text/plain, */*']]);
        $response = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if (!is_string($response) || $status < 200 || $status >= 300) throw new RuntimeException("http=$status $error");
    } else {
        $response = @file_get_contents($url);
        if (!is_string($response)) throw new RuntimeException('request failed');
    }
    $decoded = json_decode(trim($response), true);
    return is_array($decoded) ? $decoded : trim($response);
}

function kuwoMvFindUrl(array|string $data): string
{
    if (is_string($data)) return preg_match('#^https?://#i', trim($data)) ? trim($data) : '';
    foreach (['url', 'playUrl', 'data', 'result'] as $key) {
        if (!array_key_exists($key, $data)) continue;
        $url = kuwoMvFindUrl($data[$key]);
        if ($url !== '') return $url;
    }
    return '';
}

function kuwoMvJson(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
