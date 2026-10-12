<?php
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */


require_once __DIR__ . '/_features.php';
xcloudRequireSource('netease');
// 官方协议示例：GET music.163.com/api/playlist/detail?id={playlist_id}，解析 result/tracks；上游可用性需部署验证。

/**
 * 获取网易云音乐歌单信息API
 *
 * 使用方法:
 * GET /php/get_netease_playlist.php?id={playlist_id}
 *
 * 参数:
 * - id: 网易云歌单ID (必需)
 *
 * 返回格式:
 * {
 *   "success": true/false,
 *   "code": 200,
 *   "playlist": {
 *     "name": "歌单名称",
 *     "tracks": [
 *       {
 *         "id": "歌曲ID",
 *         "name": "歌曲名称",
 *         "ar": [{"name": "歌手名"}],
 *         "al": {"name": "专辑名", "pic": "封面URL"}
 *       }
 *     ]
 *   }
 * }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

function respondError($message) {
    echo json_encode([
        'success' => false,
        'message' => $message
    ]);
    exit;
}

function extractFirstUrl($text) {
    if (!$text) {
        return '';
    }

    if (preg_match('/https?:\/\/[^\s"\']+/iu', $text, $matches)) {
        return $matches[0];
    }

    return '';
}

function extractPlaylistIdFromText($text) {
    if (!$text) {
        return '';
    }

    $decodedText = html_entity_decode(urldecode($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');

    if (preg_match('/(?:playlist|discover\/playlist)[^\\d]{0,100}id=(\d+)/iu', $decodedText, $matches)) {
        return $matches[1];
    }

    if (preg_match('/[?&]id=(\d+)/', $decodedText, $matches)) {
        return $matches[1];
    }

    return '';
}

function resolvePlaylistIdFromLink($rawInput) {
    $directId = extractPlaylistIdFromText($rawInput);
    if ($directId !== '') {
        return $directId;
    }

    $url = extractFirstUrl($rawInput);
    if ($url === '') {
        return '';
    }

    if (!function_exists('curl_init')) {
        return '';
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Referer: https://music.163.com/',
            'Cookie: appver=2.0.2; os=pc'
        ]
    ]);

    $response = curl_exec($ch);
    $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        return '';
    }

    $candidates = [
        $rawInput,
        $url,
        $effectiveUrl,
        $response ?: ''
    ];

    foreach ($candidates as $candidate) {
        $playlistId = extractPlaylistIdFromText($candidate);
        if ($playlistId !== '') {
            return $playlistId;
        }
    }

    return '';
}

// 获取歌单ID参数，支持纯ID、链接、带分享文案的整段文本
$playlistId = $_GET['id'] ?? '';
$playlistLink = $_GET['link'] ?? '';

if ($playlistId === '' && $playlistLink !== '') {
    $playlistId = resolvePlaylistIdFromLink($playlistLink);
}

if ($playlistId === '' && isset($_GET['text'])) {
    $playlistId = resolvePlaylistIdFromLink($_GET['text']);
}

if ($playlistId === '') {
    respondError('缺少歌单ID或有效链接参数');
}

if (!is_numeric($playlistId)) {
    respondError('无法从分享内容中解析出有效歌单ID');
}

try {
    // 网易云音乐API地址
    $apiUrl = "https://music.163.com/api/playlist/detail?id=" . $playlistId;

    // 检查cURL是否可用
    if (!function_exists('curl_init')) {
        respondError('服务器未配置cURL扩展');
    }

    // 初始化cURL
    $ch = curl_init();

    // 设置cURL选项
    curl_setopt_array($ch, [
        CURLOPT_URL => $apiUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Referer: https://music.163.com/',
            'Cookie: appver=2.0.2; os=pc'
        ]
    ]);

    // 执行请求
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    curl_close($ch);

    // 检查请求是否成功
    if ($error) {
        respondError('API请求失败: ' . $error);
    }

    if ($httpCode !== 200) {
        respondError('API返回错误状态码: ' . $httpCode);
    }

    // 解析JSON响应
    $data = json_decode($response, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        respondError('解析API响应失败');
    }

    // 检查API响应是否成功
    if (!isset($data['result']) || $data['result'] !== null) {
        // 网易云API的响应结构检查
        if (isset($data['code']) && $data['code'] == 200 && isset($data['result'])) {
            $playlist = $data['result'];

            // 格式化响应数据以匹配前端期望的格式
            $formattedResponse = [
                'success' => true,
                'code' => 200,
                'playlist_id' => (string)$playlistId,
                'playlist' => [
                    'name' => $playlist['name'] ?? '未知歌单',
                    'tracks' => []
                ]
            ];

            // 处理歌曲列表
            if (isset($playlist['tracks']) && is_array($playlist['tracks'])) {
                foreach ($playlist['tracks'] as $track) {
                    $formattedTrack = [
                        'id' => $track['id'] ?? '',
                        'name' => $track['name'] ?? '未知歌曲',
                        'ar' => isset($track['artists']) ? array_map(function($artist) {
                            return ['name' => $artist['name'] ?? '未知歌手'];
                        }, $track['artists']) : [['name' => '未知歌手']],
                        'al' => [
                            'name' => $track['album']['name'] ?? '未知专辑',
                            'pic' => str_replace('http://', 'https://', $track['album']['picUrl'] ?? ''),
                            'pic_str' => str_replace('http://', 'https://', $track['album']['picUrl'] ?? '')
                        ]
                    ];
                    $formattedResponse['playlist']['tracks'][] = $formattedTrack;
                }
            }

            echo json_encode($formattedResponse);
        } else {
            respondError('获取歌单失败，可能歌单不存在或无权限访问');
        }
    } else {
        respondError('API返回无效数据');
    }

} catch (Exception $e) {
    respondError('服务器内部错误');
}
?>
