<?php
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */


require_once __DIR__ . '/_features.php';
xcloudRequireSource('netease');
// 官方协议示例：search/get/web 使用 s/type/limit/offset，artist/{id} 与 v1/artist/songs 返回歌手及歌曲；上游可用性需部署验证。

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$action = isset($_GET['action']) ? strtolower(trim((string) $_GET['action'])) : 'search';

if ($action === 'search') {
    $keyword = isset($_GET['name']) ? trim((string) $_GET['name']) : '';
    if ($keyword === '' || strlen($keyword) > 200) {
        sendJsonError('Invalid artist keyword.', 400);
    }

    $artists = searchNeteaseArtists($keyword);
    echo json_encode([
        'code' => 200,
        'data' => $artists
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($action === 'detail') {
    $artistId = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
    if ($artistId === '' || !preg_match('/^\d+$/', $artistId)) {
        sendJsonError('Invalid artist ID.', 400);
    }

    echo json_encode(getNeteaseArtistDetail($artistId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($action === 'songs') {
    $artistId = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
    if ($artistId === '' || !preg_match('/^\d+$/', $artistId)) {
        sendJsonError('Invalid artist ID.', 400);
    }

    $page = isset($_GET['pages']) ? max(1, (int) $_GET['pages']) : 1;
    $limit = isset($_GET['limit']) ? max(1, min(50, (int) $_GET['limit'])) : 20;
    echo json_encode(getNeteaseArtistSongs($artistId, $page, $limit), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

sendJsonError('Invalid action.', 400);

function searchNeteaseArtists($keyword) {
    $data = requestJson('http://music.163.com/api/search/get/web', [
        'method' => 'POST',
        'data' => [
            's' => $keyword,
            'type' => 100,
            'limit' => 5,
            'offset' => 0,
            'total' => 'true'
        ]
    ]);

    $artists = isset($data['result']['artists']) && is_array($data['result']['artists'])
        ? $data['result']['artists']
        : [];

    if (!empty($artists)) {
        return array_map('mapNeteaseArtist', $artists);
    }

    $artists = searchNeteaseArtistsWithGetFallback($keyword);
    if (!empty($artists)) {
        return $artists;
    }

    return searchArtistsFromSongResults($keyword);
}

function searchArtistsFromSongResults($keyword) {
    $data = requestJson('http://music.163.com/api/search/get/web', [
        'method' => 'POST',
        'data' => [
            's' => $keyword,
            'type' => 1,
            'limit' => 10,
            'offset' => 0,
            'total' => 'true'
        ]
    ]);

    $songs = isset($data['result']['songs']) && is_array($data['result']['songs'])
        ? $data['result']['songs']
        : [];

    if (empty($songs)) {
        return [];
    }

    $songIds = array_values(array_filter(array_map(function($song) {
        return isset($song['id']) ? (string) $song['id'] : '';
    }, $songs)));
    $details = fetchNeteaseSongDetails($songIds);
    $artists = [];

    foreach ($details as $song) {
        $songArtists = [];
        if (isset($song['artists']) && is_array($song['artists'])) {
            $songArtists = $song['artists'];
        } elseif (isset($song['ar']) && is_array($song['ar'])) {
            $songArtists = $song['ar'];
        }

        foreach ($songArtists as $artist) {
            $id = isset($artist['id']) ? (string) $artist['id'] : '';
            $name = isset($artist['name']) ? trim((string) $artist['name']) : '';
            if ($id === '' || $name === '') {
                continue;
            }

            if (!isset($artists[$id])) {
                $artists[$id] = [
                    'id' => $id,
                    'name' => $name,
                    'pic_url' => normalizeHttpsUrl($artist['picUrl'] ?? ''),
                    'album_size' => $artist['albumSize'] ?? 0,
                    'music_size' => $artist['musicSize'] ?? 0
                ];
            }
        }

        if (!empty($artists)) {
            break;
        }
    }

    return array_values($artists);
}

function fetchNeteaseSongDetails($songIds) {
    $songIds = array_values(array_unique(array_filter($songIds)));
    if (empty($songIds)) {
        return [];
    }

    $url = 'http://music.163.com/api/song/detail?' . http_build_query([
        'ids' => json_encode(array_map('intval', $songIds))
    ], '', '&', PHP_QUERY_RFC3986);

    $data = requestJson($url);
    return isset($data['songs']) && is_array($data['songs']) ? $data['songs'] : [];
}

function mapNeteaseArtist($artist) {
    return [
        'id' => $artist['id'] ?? '',
        'name' => $artist['name'] ?? '',
        'pic_url' => resizeNeteaseImageUrl($artist['picUrl'] ?? '', 320, 320),
        'album_size' => $artist['albumSize'] ?? 0,
        'music_size' => $artist['musicSize'] ?? 0
    ];
}

function searchNeteaseArtistsWithGetFallback($keyword) {
    $url = 'http://music.163.com/api/search/get/web?' . http_build_query([
        's' => $keyword,
        'type' => 100,
        'limit' => 3,
        'offset' => 0
    ], '', '&', PHP_QUERY_RFC3986);

    $data = requestJson($url);
    $artists = isset($data['result']['artists']) && is_array($data['result']['artists'])
        ? $data['result']['artists']
        : [];

    return array_map('mapNeteaseArtist', $artists);
}

function getNeteaseArtistDetail($artistId) {
    $artistData = requestJson('http://music.163.com/api/artist/' . rawurlencode($artistId));
    $introData = requestJson('https://music.163.com/api/artist/introduction?id=' . rawurlencode($artistId));
    if (empty($introData)) {
        $introData = requestJson('http://music.163.com/api/artist/introduction?id=' . rawurlencode($artistId));
    }
    $descData = requestJson('http://music.163.com/api/artist/desc?id=' . rawurlencode($artistId));
    $interfaceDescData = requestJson('http://interface.music.163.com/api/artist/desc/get?id=' . rawurlencode($artistId));
    $htmlDesc = fetchArtistDescriptionFromHtml($artistId);

    $artist = isset($artistData['artist']) && is_array($artistData['artist']) ? $artistData['artist'] : [];
    $songPage = getNeteaseArtistSongs($artistId, 1, 20);
    $songs = $songPage['songs'] ?? [];

    return [
        'code' => 200,
        'artist' => [
            'id' => $artist['id'] ?? $artistId,
            'name' => $artist['name'] ?? '',
            'pic_url' => resizeNeteaseImageUrl($artist['picUrl'] ?? '', 320, 320),
            'brief_desc' => firstNonEmpty([
                $introData['briefDesc'] ?? '',
                $artist['briefDesc'] ?? '',
                $descData['briefDesc'] ?? '',
                $interfaceDescData['data']['briefDesc'] ?? '',
                $interfaceDescData['briefDesc'] ?? '',
                $htmlDesc['brief_desc'] ?? ''
            ]),
            'introduction' => isset($introData['introduction']) && is_array($introData['introduction'])
                ? $introData['introduction']
                : (
                    isset($descData['introduction']) && is_array($descData['introduction'])
                        ? $descData['introduction']
                        : (
                            isset($interfaceDescData['data']['introduction']) && is_array($interfaceDescData['data']['introduction'])
                                ? $interfaceDescData['data']['introduction']
                                : ($htmlDesc['introduction'] ?? [])
                        )
                ),
            'album_size' => $artist['albumSize'] ?? 0,
            'music_size' => $artist['musicSize'] ?? count($songs)
        ],
        'songs' => $songs,
        'has_more' => $songPage['has_more'] ?? false
    ];
}

function getNeteaseArtistSongs($artistId, $page = 1, $limit = 20) {
    $offset = (max(1, (int) $page) - 1) * $limit;
    $data = requestJson('https://music.163.com/api/v1/artist/songs?' . http_build_query([
        'id' => $artistId,
        'limit' => $limit,
        'offset' => $offset
    ], '', '&', PHP_QUERY_RFC3986));

    if (empty($data)) {
        $data = requestJson('http://music.163.com/api/v1/artist/songs?' . http_build_query([
            'id' => $artistId,
            'limit' => $limit,
            'offset' => $offset
        ], '', '&', PHP_QUERY_RFC3986));
    }

    $songs = isset($data['songs']) && is_array($data['songs']) ? $data['songs'] : [];

    return [
        'code' => 200,
        'songs' => array_map('mapNeteaseSong', $songs),
        'has_more' => !empty($data['more'])
    ];
}

function mapNeteaseSong($song) {
    $album = [];
    if (isset($song['album']) && is_array($song['album'])) {
        $album = $song['album'];
    } elseif (isset($song['al']) && is_array($song['al'])) {
        $album = $song['al'];
    }

    $songArtists = [];
    if (isset($song['artists']) && is_array($song['artists'])) {
        $songArtists = $song['artists'];
    } elseif (isset($song['ar']) && is_array($song['ar'])) {
        $songArtists = $song['ar'];
    }

    $artists = array_map(function($artist) {
        return $artist['name'] ?? '';
    }, $songArtists);

    $id = $song['id'] ?? '';

    return [
        'id' => $id,
        'name' => $song['name'] ?? '',
        'artist' => implode(', ', array_filter($artists)),
        'album' => $album['name'] ?? '',
        'pic_id' => getNeteaseAlbumPicId($album),
        'source' => 'netease',
        'lyric_id' => $id,
        'url_id' => $id
    ];
}

function requestJson($url, $options = []) {
    $method = strtoupper($options['method'] ?? 'GET');
    $payload = isset($options['data']) && is_array($options['data'])
        ? http_build_query($options['data'], '', '&', PHP_QUERY_RFC3986)
        : '';
    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer: https://music.163.com/',
        'Cookie: os=pc; appver=2.9.7;'
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headers, [
                'Content-Type: application/x-www-form-urlencoded'
            ]));
        }
        $response = curl_exec($ch);
        curl_close($ch);
    } else {
        $streamHeaders = $headers;
        if ($method === 'POST') {
            $streamHeaders[] = 'Content-Type: application/x-www-form-urlencoded';
        }

        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $streamHeaders),
                'content' => $method === 'POST' ? $payload : '',
                'timeout' => 12,
                'ignore_errors' => true
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false
            ]
        ]);
        $response = @file_get_contents($url, false, $context);
    }

    $data = json_decode($response ?: '', true);
    return is_array($data) ? $data : [];
}

function requestText($url) {
    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer: https://music.163.com/',
        'Cookie: os=pc; appver=2.9.7;'
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        $response = curl_exec($ch);
        curl_close($ch);
        return $response ?: '';
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 12,
            'ignore_errors' => true
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false
        ]
    ]);

    return @file_get_contents($url, false, $context) ?: '';
}

function fetchArtistDescriptionFromHtml($artistId) {
    $html = requestText('http://music.163.com/artist/desc?id=' . rawurlencode($artistId));
    if ($html === '') {
        return ['brief_desc' => '', 'introduction' => []];
    }

    $brief = '';
    if (preg_match('/<div[^>]*class="[^"]*n-artdesc[^"]*"[^>]*>(.*?)<\/div>/is', $html, $matches)) {
        $brief = cleanHtmlText($matches[1]);
    }

    $introduction = [];
    if (preg_match_all('/<h2[^>]*>(.*?)<\/h2>\s*<p[^>]*>(.*?)<\/p>/is', $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $title = cleanHtmlText($match[1]);
            $text = cleanHtmlText($match[2]);
            if ($title !== '' && $text !== '') {
                $introduction[] = [
                    'ti' => $title,
                    'txt' => $text
                ];
            }
        }
    }

    return [
        'brief_desc' => $brief,
        'introduction' => $introduction
    ];
}

function cleanHtmlText($html) {
    $text = preg_replace('/<br\s*\/?>/i', "\n", (string) $html);
    $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace("/[ \t]+\n/", "\n", $text);
    $text = preg_replace("/\n{3,}/", "\n\n", $text);
    return trim($text);
}

function firstNonEmpty($values) {
    foreach ($values as $value) {
        $text = trim((string) $value);
        if ($text !== '') {
            return $text;
        }
    }

    return '';
}

function getNeteaseAlbumPicId($album) {
    foreach (['picId_str', 'pic_id_str', 'pic_str', 'picId', 'pic_id', 'pic'] as $key) {
        if (isset($album[$key]) && trim((string) $album[$key]) !== '') {
            return trim((string) $album[$key]);
        }
    }

    return '';
}

function normalizeHttpsUrl($url) {
    return preg_replace('/^http:\/\//i', 'https://', trim((string) $url));
}

function resizeNeteaseImageUrl($url, $width = 320, $height = 320) {
    $url = normalizeHttpsUrl($url);
    if ($url === '') {
        return '';
    }

    $url = preg_replace('/\?param=\d+y\d+.*$/i', '', $url);
    return $url . '?param=' . (int) $width . 'y' . (int) $height;
}

function sendJsonError($message, $status) {
    http_response_code($status);
    echo json_encode([
        'code' => $status,
        'message' => $message
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
