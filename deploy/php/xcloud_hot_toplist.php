<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('hotToplist');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');

$cacheFile = __DIR__ . '/../cache/xcloud_hot_toplist.json';

if (!file_exists($cacheFile)) {
    echo json_encode([
        'code' => 200,
        'type' => 'xcloud_hot',
        'name' => 'XCloud热歌榜',
        'data' => [],
        'updated_at' => null,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$json = file_get_contents($cacheFile);
$data = json_decode($json ?: '', true);

if (!is_array($data)) {
    http_response_code(500);
    echo json_encode(['code' => 500, 'message' => 'XCloud hot chart cache is invalid.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = sanitizeHotToplistPayload($data);
echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

function sanitizeHotToplistPayload($payload)
{
    if (!isset($payload['data']) || !is_array($payload['data'])) {
        return $payload;
    }

    foreach ($payload['data'] as &$song) {
        if (!is_array($song)) {
            continue;
        }

        $title = cleanHotToplistSongTitle((string)($song['name'] ?? $song['title'] ?? ''));
        if ($title !== '') {
            $song['name'] = $title;
            $song['title'] = $title;
        }
    }
    unset($song);

    return $payload;
}

function cleanHotToplistSongTitle($title)
{
    return preg_replace('/\s*(网易|酷我|酷狗|QQ)\s*$/u', '', trim($title));
}
