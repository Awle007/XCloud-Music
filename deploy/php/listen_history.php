<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once 'config.php';

$input = getInput();
$action = strtolower(trim((string)($input['action'] ?? 'list')));
$userId = (int)($input['user_id'] ?? 0);

if ($userId <= 0) {
    sendJson(['success' => false, 'message' => '缺少用户ID'], 400);
}

try {
    $conn = getDBConnection();
    ensureListenHistoryTable($conn);
    purgeOldHistory($conn);

    switch ($action) {
        case 'add':
            addHistory($conn, $userId, $input);
            break;
        case 'list':
        default:
            listHistory($conn, $userId);
            break;
    }
} catch (Throwable $e) {
    sendJson(['success' => false, 'message' => '服务暂时不可用'], 500);
}

function getInput()
{
    $input = $_POST;
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
        $json = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
            $input = array_merge($input, $json);
        }
    }
    return $input;
}

function ensureListenHistoryTable($conn)
{
    $conn->exec("CREATE TABLE IF NOT EXISTS listen_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        song_id VARCHAR(120) NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'netease',
        song_title VARCHAR(255) NOT NULL,
        song_artist VARCHAR(255) NOT NULL,
        song_cover VARCHAR(512) DEFAULT '',
        song_album VARCHAR(255) DEFAULT '',
        listen_count INT NOT NULL DEFAULT 1,
        listened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_history_song (user_id, song_id, source),
        INDEX idx_history_user_time (user_id, listened_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function purgeOldHistory($conn)
{
    $conn->exec('DELETE FROM listen_history WHERE listened_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
}

function addHistory($conn, $userId, $input)
{
    $songId = trim((string)($input['song_id'] ?? ''));
    $source = trim((string)($input['source'] ?? 'netease'));
    $title = cleanHistorySongTitle((string)($input['song_title'] ?? ''));
    $artist = trim((string)($input['song_artist'] ?? ''));
    $cover = trim((string)($input['song_cover'] ?? ''));
    $album = trim((string)($input['album'] ?? $input['song_album'] ?? ''));

    if ($songId === '' || $title === '' || $artist === '') {
        sendJson(['success' => false, 'message' => '歌曲信息不完整'], 400);
    }

    $stmt = $conn->prepare("INSERT INTO listen_history
        (user_id, song_id, source, song_title, song_artist, song_cover, song_album, listen_count, listened_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE
            song_title = VALUES(song_title),
            song_artist = VALUES(song_artist),
            song_cover = VALUES(song_cover),
            song_album = VALUES(song_album),
            listen_count = listen_count + 1,
            listened_at = NOW()");
    $stmt->execute([$userId, $songId, $source, $title, $artist, $cover, $album]);

    sendJson(['success' => true]);
}

function listHistory($conn, $userId)
{
    $stmt = $conn->prepare('SELECT song_id, source, song_title, song_artist, song_cover, song_album, listen_count, listened_at
        FROM listen_history
        WHERE user_id = ? AND listened_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY listened_at DESC
        LIMIT 500');
    $stmt->execute([$userId]);

    $songs = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $songTitle = cleanHistorySongTitle((string)$row['song_title']);
        $songs[] = [
            'id' => $row['song_id'],
            'source' => $row['source'],
            'name' => $songTitle,
            'title' => $songTitle,
            'artist' => $row['song_artist'],
            'album' => $row['song_album'],
            'pic_id' => $row['song_cover'],
            'listen_count' => (int)$row['listen_count'],
            'listened_at' => $row['listened_at'],
        ];
    }

    sendJson(['success' => true, 'data' => $songs]);
}

function sendJson($payload, $status = 200)
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function cleanHistorySongTitle($title)
{
    return preg_replace('/\s*(网易|酷我|酷狗|QQ)\s*$/u', '', trim($title));
}
