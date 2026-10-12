<?php
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */


require_once __DIR__ . '/_features.php';
xcloudRequireSource('netease');
// 官方协议示例：GET music.163.com/api/playlist/detail?id={id} 与 song/detail?ids=[...]；上游可用性需部署验证。

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

/**
 * 网易云音乐榜单数据自动更新脚本
 * 
 * 此脚本用于定时获取网易云音乐榜单数据并缓存到本地文件
 * 建议通过crontab每天定时执行一次，例如：
 * 0 3 * * * php /path/to/update_toplist.php
 */

// 设置缓存文件目录
$cacheDir = __DIR__ . '/../cache';
if (!file_exists($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

// 榜单ID映射
$toplistIds = [
    'soaring' => '19723756', // 飙升榜
    'new' => '3779629',      // 新歌榜
    'original' => '2884035', // 原创榜
    'hot' => '3778678',      // 热歌榜
    'rap' => '991319590',    // 说唱榜
    'electronic' => '1978921795', // 电音榜
    'euro_america' => '2809513713', // 欧美热歌榜
    'billboard' => '60198',  // 美国Billboard榜
    'beatport' => '3812895', // Beatport全球电子舞曲榜
    'korean' => '745956260', // 韩语榜
    'uk' => '180106'         // UK排行榜周榜
];

// 获取并缓存每个榜单数据
foreach ($toplistIds as $type => $id) {
    echo "正在更新 {$type} 榜单数据...\n";
    $data = fetchToplistData($id, $type);
    
    if ($data) {
        $cacheFile = "{$cacheDir}/toplist_{$type}.json";
        file_put_contents($cacheFile, json_encode($data, JSON_UNESCAPED_UNICODE));
        echo "成功更新 {$type} 榜单数据，共 " . count($data['data']) . " 首歌曲\n";
    } else {
        echo "更新 {$type} 榜单数据失败\n";
    }
}

echo "所有榜单数据更新完成\n";

/**
 * 获取榜单数据
 * 
 * @param string $id 榜单ID
 * @param string $type 榜单类型
 * @return array|false 榜单数据或失败时返回false
 */
function fetchToplistData($id, $type) {
    // 目标榜单URL
    $url = "https://music.163.com/discover/toplist?id=" . $id;

    // 设置请求头模拟浏览器
    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer: https://music.163.com/'
    ];

    // 发起请求
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $html = curl_exec($ch);
    
    if (curl_errno($ch)) {
        echo "cURL Error: " . curl_error($ch) . "\n";
        curl_close($ch);
        return false;
    }
    
    curl_close($ch);

    // 解析JSON数据（位于textarea标签内）
    if (!preg_match('/<textarea id="song-list-pre-data".*?>(.*?)<\/textarea>/s', $html, $matches)) {
        echo "未找到榜单数据\n";
        return false;
    }
    
    $jsonData = json_decode($matches[1] ?? '', true);

    // 提取歌曲信息
    $songs = [];
    if ($jsonData && is_array($jsonData)) {
        $songIds = array_values(array_filter(array_map(function($song) {
            return isset($song['id']) ? (string) $song['id'] : '';
        }, $jsonData)));
        $songDetails = fetchNeteaseSongDetails($songIds);

        foreach ($jsonData as $song) {
            $artists = array_map(function($ar) { return $ar['name']; }, $song['artists']);
            $songId = (string) $song['id'];
            $detail = isset($songDetails[$songId]) ? $songDetails[$songId] : [];
            $album = isset($song['album']) && is_array($song['album']) ? $song['album'] : [];
            $detailAlbum = isset($detail['album']) && is_array($detail['album']) ? $detail['album'] : [];
            $picId = getNeteaseAlbumPicId($detailAlbum) ?: getNeteaseAlbumPicId($album);

            $songs[] = [
                'id' => $song['id'],
                'name' => normalizeToplistSongName($song['name']),
                'artist' => implode(', ', $artists),
                'album' => $album['name'] ?? ($detailAlbum['name'] ?? ''),
                'pic_id' => $picId,
                'source' => 'netease',
                'rank' => $song['position'] ?? count($songs) + 1
            ];
        }
    }

    return [
        'code' => 200,
        'type' => $type,
        'name' => getToplistName($type),
        'data' => $songs,
        'updated_at' => date('Y-m-d H:i:s')
    ];
}

/**
 * 获取榜单名称
 * 
 * @param string $type 榜单类型
 * @return string 榜单名称
 */
function getToplistName($type) {
    $names = [
        'soaring' => '飙升榜',
        'new' => '新歌榜',
        'original' => '原创榜',
        'hot' => '热歌榜',
        'rap' => '说唱榜',
        'electronic' => '电音榜',
        'euro_america' => '欧美热歌榜',
        'billboard' => '美国Billboard榜',
        'beatport' => 'Beatport电子榜',
        'korean' => '韩语榜',
        'uk' => 'UK排行榜'
    ];
    return isset($names[$type]) ? $names[$type] : '榜单';
} 

function normalizeToplistSongName($name) {
    return preg_replace('/^\s*\d+\s*[.．、:：-]?\s*/u', '', (string) $name);
}

function fetchNeteaseSongDetails($songIds) {
    $songIds = array_values(array_unique(array_filter($songIds)));
    if (empty($songIds)) {
        return [];
    }

    $url = 'https://music.163.com/api/song/detail?ids=' . rawurlencode(json_encode(array_map('intval', $songIds)));
    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer: https://music.163.com/'
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    $response = curl_exec($ch);
    curl_close($ch);

    $data = json_decode($response ?: '', true);
    if (!isset($data['songs']) || !is_array($data['songs'])) {
        return [];
    }

    $details = [];
    foreach ($data['songs'] as $song) {
        if (isset($song['id'])) {
            $details[(string) $song['id']] = $song;
        }
    }

    return $details;
}

function getNeteaseAlbumPicId($album) {
    if (!is_array($album)) {
        return '';
    }

    foreach (['picId_str', 'pic_id_str', 'picId', 'pic_id'] as $key) {
        if (isset($album[$key]) && trim((string) $album[$key]) !== '') {
            return trim((string) $album[$key]);
        }
    }

    return '';
}
