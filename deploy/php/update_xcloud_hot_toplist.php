<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('hotToplist');

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

/**
 * Generate XCloud global hot song chart from logged-in users' listen history.
 * Recommended cron: 0 0 * * * php /path/to/php/update_xcloud_hot_toplist.php
 */

require_once __DIR__ . '/config.php';

$cacheDir = __DIR__ . '/../cache';
$cacheFile = $cacheDir . '/xcloud_hot_toplist.json';

if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

try {
    $conn = getDBConnection();
    ensureListenHistoryTableForHotToplist($conn);
    purgeOldListenHistoryForHotToplist($conn);

    $stmt = $conn->prepare("
        SELECT
            song_id,
            source,
            MAX(song_title) AS song_title,
            MAX(song_artist) AS song_artist,
            MAX(song_album) AS song_album,
            MAX(song_cover) AS song_cover,
            SUM(listen_count) AS total_plays,
            COUNT(DISTINCT user_id) AS listener_count,
            MAX(listened_at) AS last_listened_at
        FROM listen_history
        WHERE listened_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY song_id, source
        ORDER BY listener_count DESC, total_plays DESC, last_listened_at DESC
        LIMIT 100
    ");
    $stmt->execute();

    $songs = [];
    $rank = 1;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $songTitle = cleanHotToplistSongTitle((string)$row['song_title']);
        $songs[] = [
            'id' => (string)$row['song_id'],
            'source' => (string)$row['source'],
            'name' => $songTitle,
            'title' => $songTitle,
            'artist' => (string)$row['song_artist'],
            'album' => (string)($row['song_album'] ?? ''),
            'pic_id' => (string)($row['song_cover'] ?? ''),
            'listen_count' => (int)$row['total_plays'],
            'play_count' => (int)$row['total_plays'],
            'listener_count' => (int)$row['listener_count'],
            'rank' => $rank++,
        ];
    }

    $payload = [
        'code' => 200,
        'type' => 'xcloud_hot',
        'name' => 'XCloud热歌榜',
        'data' => $songs,
        'updated_at' => date('Y-m-d H:i:s'),
    ];

    file_put_contents($cacheFile, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

    if (PHP_SAPI === 'cli') {
        echo "Generated XCloud hot chart: " . count($songs) . " songs\n";
    }
} catch (Throwable $e) {
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, "Failed to generate XCloud hot chart: " . $e->getMessage() . "\n");
        exit(1);
    }

    http_response_code(500);
    echo json_encode(['code' => 500, 'message' => '服务暂时不可用'], JSON_UNESCAPED_UNICODE);
}

function ensureListenHistoryTableForHotToplist($conn)
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

function purgeOldListenHistoryForHotToplist($conn)
{
    $conn->exec('DELETE FROM listen_history WHERE listened_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
}

function cleanHotToplistSongTitle($title)
{
    return preg_replace('/\s*(网易|酷我|酷狗|QQ)\s*$/u', '', trim($title));
}
