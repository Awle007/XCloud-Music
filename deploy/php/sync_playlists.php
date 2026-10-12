<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once __DIR__ . '/config.php';

$userId = (int)($_POST['user_id'] ?? 0);
$playlistsJson = (string)($_POST['playlists'] ?? '');
$playlists = json_decode($playlistsJson, true);

if ($userId <= 0 || !is_array($playlists)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '歌单同步参数无效'], JSON_UNESCAPED_UNICODE);
    exit;
}

function xcloudPlaylistText($value, int $length, string $fallback = ''): string
{
    $text = trim(is_array($value) ? implode(', ', $value) : (string)$value);
    if ($text === '') $text = $fallback;
    return function_exists('mb_substr') ? mb_substr($text, 0, $length, 'UTF-8') : substr($text, 0, $length);
}

function xcloudPlaylistAddedAt(array $song): ?string
{
    $value = $song['playlist_added_at'] ?? $song['added_at'] ?? $song['timestamp'] ?? null;
    if ($value === null || $value === '') return null;
    if (is_numeric($value)) {
        $timestamp = (float)$value;
        if ($timestamp >= 1000000000000) $timestamp /= 1000;
        $unix = (int)$timestamp;
    } else {
        $parsed = strtotime((string)$value);
        if ($parsed === false) return null;
        $unix = $parsed;
    }
    if ($unix < 1 || $unix > 2147483647) return null;
    return date('Y-m-d H:i:s', $unix);
}

$conn = null;
try {
    $conn = getDBConnection();
    $conn->beginTransaction();

    $findPlaylist = $conn->prepare('SELECT id FROM playlists WHERE user_id = ? AND name = ? LIMIT 1');
    $createPlaylist = $conn->prepare('INSERT INTO playlists (user_id, name) VALUES (?, ?)');
    $clearPlaylist = $conn->prepare('DELETE FROM playlist_songs WHERE playlist_id = ?');
    $insertSong = $conn->prepare(
        'INSERT INTO playlist_songs
        (playlist_id, song_id, source, song_title, song_artist, song_cover, song_album, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))'
    );

    $playlistCount = 0;
    $songCount = 0;
    $duplicatesSkipped = 0;

    foreach ($playlists as $rawName => $rawSongs) {
        $playlistName = xcloudPlaylistText($rawName, 100);
        if ($playlistName === '' || !is_array($rawSongs)) continue;

        $findPlaylist->execute([$userId, $playlistName]);
        $playlistId = (int)$findPlaylist->fetchColumn();
        if ($playlistId <= 0) {
            $createPlaylist->execute([$userId, $playlistName]);
            $playlistId = (int)$conn->lastInsertId();
        }

        // The payload is the complete content of this playlist. Replacing it is
        // idempotent and also removes duplicates created by older append syncs.
        $clearPlaylist->execute([$playlistId]);

        $uniqueSongs = [];
        $songOrder = [];
        foreach ($rawSongs as $song) {
            if (!is_array($song)) continue;
            $songId = xcloudPlaylistText($song['id'] ?? $song['song_id'] ?? '', 50);
            $source = strtolower(xcloudPlaylistText($song['source'] ?? 'netease', 20, 'netease'));
            if ($songId === '' || $source === '') continue;
            $key = $source . "\0" . $songId;
            if (isset($uniqueSongs[$key])) $duplicatesSkipped++;
            else $songOrder[] = $key;
            $uniqueSongs[$key] = $song;
        }

        foreach ($songOrder as $key) {
            $song = $uniqueSongs[$key];
            [$source, $songId] = explode("\0", $key, 2);
            $insertSong->execute([
                $playlistId,
                $songId,
                $source,
                xcloudPlaylistText($song['name'] ?? $song['title'] ?? $song['song_title'] ?? '', 255, '未知歌曲'),
                xcloudPlaylistText($song['artist'] ?? $song['song_artist'] ?? '', 255, '未知歌手'),
                xcloudPlaylistText($song['pic_id'] ?? $song['song_cover'] ?? '', 255),
                xcloudPlaylistText($song['album'] ?? $song['song_album'] ?? '', 255),
                xcloudPlaylistAddedAt($song),
            ]);
            $songCount++;
        }
        $playlistCount++;
    }

    $conn->commit();
    echo json_encode([
        'success' => true,
        'message' => '歌单已安全同步',
        'mode' => 'replace',
        'playlists_count' => $playlistCount,
        'songs_count' => $songCount,
        'duplicates_skipped' => $duplicatesSkipped,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    if ($conn instanceof PDO && $conn->inTransaction()) $conn->rollBack();
    error_log('Safe playlist sync failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '歌单同步失败，数据库未发生更改'], JSON_UNESCAPED_UNICODE);
}
