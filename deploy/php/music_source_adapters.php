<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

require_once __DIR__ . '/_env.php';

/**
 * 音乐 API 调用示例：local 协议参考离线版 local_source.php；meting 为 types 协议。
 * 示例不附带可用服务。仅协议兼容时可直接填写 .env；不兼容时须新增查询/响应适配，
 * 保持本文件的统一返回结构。完整契约见源码仓库 docs/MUSIC_API.md。
 * 本文件仅提供库函数，不读取客户端传入的上游地址，不依赖数据库。
 */

function xcloudMusicPlatforms(): array {
    return ['netease' => '网易云音乐', 'kuwo' => '酷我音乐', 'qq' => 'QQ音乐', 'kugou' => '酷狗音乐'];
}

function xcloudMusicProviders(string $source): array {
    $providers = [];
    for ($index = 1; $index <= 20; $index++) {
        $prefix = 'XCLOUD_MUSIC_API_' . $index . '_';
        $enabled = xcloudEnv($prefix . 'ENABLED', '1');
        if (!in_array($enabled, ['0', '1'], true)) throw new RuntimeException('音乐 API 开关仅接受 0 或 1');
        if ($enabled === '0') continue;
        $url = xcloudEnv($prefix . 'URL', '');
        if ($url === '') continue;
        $sources = array_map('trim', explode(',', xcloudEnv($prefix . 'SOURCES', 'netease,kuwo,qq,kugou')));
        if (array_diff($sources, array_keys(xcloudMusicPlatforms()))) throw new RuntimeException('音乐 API 平台配置无效');
        if (!in_array($source, $sources, true)) continue;
        $format = xcloudEnv($prefix . 'FORMAT', 'local');
        if (!in_array($format, ['local', 'meting'], true)) throw new RuntimeException('音乐 API 协议未实现，请编写 PHP 适配器');
        if (!xcloudMusicHttpUrl($url) || parse_url($url, PHP_URL_FRAGMENT) !== null) throw new RuntimeException('音乐 API 地址配置无效');
        $providers[] = ['url' => $url, 'format' => $format];
    }
    return $providers;
}

function xcloudMusicHttpUrl(mixed $value): bool {
    return is_string($value) && filter_var($value, FILTER_VALIDATE_URL) !== false
        && in_array(strtolower((string)parse_url($value, PHP_URL_SCHEME)), ['http', 'https'], true);
}

function xcloudMusicQuery(string $format, string $action, string $source, array $input): array {
    if (!isset(xcloudMusicPlatforms()[$source])) throw new InvalidArgumentException('不支持的音乐平台');
    $id = (string)($input['id'] ?? '');
    $quality = xcloudMusicQuality((string)($input['quality'] ?? '320'));
    if ($format === 'local') {
        $query = ['source' => xcloudMusicPlatforms()[$source]];
        if ($action === 'search' || $action === 'health') return $query + [
            'api' => 'search_with_source', 'key' => $input['keyword'] ?? 'test', 'pn' => (int)($input['page'] ?? 1),
        ];
        return $query + ['api' => $action === 'lyric' ? 'get_lyrics_with_source' : 'get_song_with_source', 'id' => $id];
    }
    if ($format !== 'meting') throw new InvalidArgumentException('不支持的音乐 API 协议');
    $query = ['types' => match ($action) { 'cover' => 'pic', 'health' => 'search', default => $action }, 'source' => $source];
    if ($action === 'search' || $action === 'health') return $query + [
        'name' => $input['keyword'] ?? 'test', 'pages' => (int)($input['page'] ?? 1),
        'count' => (int)($input['limit'] ?? 30), 'limit' => (int)($input['limit'] ?? 30),
    ];
    $pictureId = trim((string)($input['pic_id'] ?? ''));
    return $query + ['id' => $action === 'cover' && $pictureId !== '' ? $pictureId : $id, 'br' => $quality, 'size' => 300];
}

function xcloudMusicQuality(string $quality): int {
    if (preg_match('/^kg_([1-5])$/', $quality, $matches)) return [1 => 128, 2 => 320, 3 => 999, 4 => 999, 5 => 999][(int)$matches[1]];
    return in_array($quality, ['128', '192', '320', '999'], true) ? (int)$quality : 320;
}

function xcloudMusicNormalize(string $format, string $action, string $source, array $payload, array $input): array {
    if ($action === 'search' || $action === 'health') {
        if ($format === 'local') {
            if (($payload['code'] ?? null) !== 0 || !is_array($payload['data']['songs'] ?? null)) throw new RuntimeException('搜索响应不符合 local 协议');
            $rows = $payload['data']['songs'];
        } else {
            if (!array_is_list($payload)) throw new RuntimeException('搜索响应不符合 meting 协议');
            $rows = $payload;
        }
        $songs = [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $id = trim((string)($format === 'local' ? ($row['rid'] ?? '') : ($row['id'] ?? '')));
            if ($id === '') continue;
            $artist = $row['artist'] ?? '';
            if (is_array($artist)) $artist = implode(', ', array_map(static fn($item) => is_array($item) ? (string)($item['name'] ?? '') : (string)$item, $artist));
            $songs[] = [
                'id' => $id, 'url_id' => (string)($row['url_id'] ?? $id), 'lyric_id' => (string)($row['lyric_id'] ?? $id),
                'source' => $source, 'name' => (string)($row['name'] ?? ''), 'artist' => (string)$artist,
                'album' => (string)($row['album'] ?? ''), 'pic_id' => (string)($format === 'local' ? ($row['pic'] ?? '') : ($row['pic_id'] ?? '')),
                'duration' => $row['duration'] ?? null,
            ];
        }
        if ($rows !== [] && $songs === []) throw new RuntimeException('搜索结果缺少歌曲 ID');
        return ['data' => $songs];
    }
    if ($action === 'lyric') {
        $lyric = $format === 'local' ? ($payload['gc'] ?? null) : ($payload['lyric'] ?? null);
        if (!is_string($lyric)) throw new RuntimeException('歌词响应格式不正确');
        return ['lyric' => $lyric, 'tlyric' => (string)($payload['tlyric'] ?? '')];
    }
    if ($action === 'cover') {
        $cover = $format === 'local' ? ($payload['pic'] ?? '') : ($payload['url'] ?? '');
        return ['pic' => xcloudMusicHttpUrl($cover) ? $cover : '', 'url' => xcloudMusicHttpUrl($cover) ? $cover : ''];
    }
    if ($format === 'meting') {
        if (!xcloudMusicHttpUrl($payload['url'] ?? null)) throw new RuntimeException('播放响应未提供有效 URL');
        return [
            'url' => $payload['url'], 'source' => $source, 'br' => $payload['br'] ?? xcloudMusicQuality((string)($input['quality'] ?? '320')),
            'type' => (string)($payload['type'] ?? pathinfo((string)parse_url($payload['url'], PHP_URL_PATH), PATHINFO_EXTENSION)),
            'lyric' => (string)($payload['lyric'] ?? ''),
        ];
    }
    $options = $payload['data'] ?? null;
    if (!is_array($options)) throw new RuntimeException('播放响应不符合 local 协议');
    $candidates = [];
    $wanted = xcloudMusicQuality((string)($input['quality'] ?? '320'));
    foreach ($options as $option) {
        if (!is_array($option) || !xcloudMusicHttpUrl($option['url'] ?? null)) continue;
        $type = strtolower((string)($option['type'] ?? ''));
        $tier = strtoupper((string)($option['ts'] ?? ''));
        $br = $type === 'flac' ? 999 : (preg_match('/^(?:HI|SQ|HQ)/', $tier) ? 320 : (str_starts_with($tier, 'MQ') ? 192 : 128));
        $distance = $br <= $wanted ? $wanted - $br : 1000 + $br - $wanted;
        $candidates[] = ['url' => $option['url'], 'br' => $br, 'type' => $type, 'ts' => $tier,
            '_score' => $distance * 10 + ($type === 'mp3' ? 0 : ($type === 'm4a' ? 1 : 2))];
    }
    if (!$candidates) throw new RuntimeException('没有有效的音频地址');
    usort($candidates, static fn($a, $b) => $a['_score'] <=> $b['_score']);
    $selected = $candidates[0];
    unset($selected['_score']);
    return $selected + ['source' => $source, 'lyric' => (string)($payload['gc'] ?? ''), 'pic' => (string)($payload['pic'] ?? '')];
}

function xcloudMusicRequest(string $url, array $query, int $timeoutMs = 18000): array {
    // 示例上游调用：仅请求 .env 中的受信任服务；严格验证 TLS，不跟随重定向。
    $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    $maxBytes = 2 * 1024 * 1024;
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        $body = '';
        curl_setopt_array($handle, [
            CURLOPT_CONNECTTIMEOUT_MS => min(5000, $timeoutMs), CURLOPT_TIMEOUT_MS => $timeoutMs, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_USERAGENT => 'XCloudMusic-Web/2.0',
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, $maxBytes): int {
                if (strlen($body) + strlen($chunk) > $maxBytes) return 0;
                $body .= $chunk;
                return strlen($chunk);
            },
        ]);
        try {
            $success = curl_exec($handle);
            $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        } finally { curl_close($handle); }
        if ($success === false || $status !== 200) throw new RuntimeException('上游请求失败');
    } else {
        $context = stream_context_create(['http' => ['timeout' => $timeoutMs / 1000, 'follow_location' => 0, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $stream = @fopen($url, 'rb', false, $context);
        if ($stream === false) throw new RuntimeException('上游连接失败');
        try { $body = stream_get_contents($stream, $maxBytes + 1); $metadata = stream_get_meta_data($stream); }
        finally { fclose($stream); }
        $status = 0;
        foreach (($metadata['wrapper_data'] ?? []) as $header) if (preg_match('#^HTTP/\S+\s+(\d+)#', $header, $match)) $status = (int)$match[1];
        if ($status !== 200 || !is_string($body) || strlen($body) > $maxBytes || !empty($metadata['timed_out'])) throw new RuntimeException('上游请求失败');
    }
    $payload = json_decode(preg_replace('/^\xEF\xBB\xBF/', '', $body), true);
    if (!is_array($payload)) throw new RuntimeException('上游返回无效 JSON');
    return $payload;
}

function xcloudMusicResolve(string $action, string $source, array $input): array {
    if (!isset(xcloudMusicPlatforms()[$source])) throw new InvalidArgumentException('不支持的音乐平台');
    // 两种示例协议都不提供相似歌曲接口：保持空结果，心动模式使用其他召回组。
    if ($action === 'similar') return ['data' => []];
    $providers = xcloudMusicProviders($source);
    if (!$providers) throw new RuntimeException('当前平台未配置兼容的音乐 API');
    $emptyResult = null;
    $deadline = microtime(true) + 45;
    foreach ($providers as $provider) {
        $remainingMs = (int)(($deadline - microtime(true)) * 1000);
        if ($remainingMs <= 0) break;
        try {
            $payload = xcloudMusicRequest($provider['url'], xcloudMusicQuery($provider['format'], $action, $source, $input), min(18000, $remainingMs));
            $result = xcloudMusicNormalize($provider['format'], $action, $source, $payload, $input);
            if ($action === 'health') return ['ok' => true];
            if ($action === 'search' && !$result['data'] || $action === 'cover' && !$result['pic'] || $action === 'lyric' && !$result['lyric']) {
                $emptyResult = $result;
                continue;
            }
            return $result;
        } catch (Throwable $error) {
            // 上游 URL、鉴权参数和响应内容均不写入公共响应或日志。
            continue;
        }
    }
    if ($emptyResult !== null) return $emptyResult;
    throw new RuntimeException('已配置的音乐 API 暂时不可用或响应格式不兼容');
}
