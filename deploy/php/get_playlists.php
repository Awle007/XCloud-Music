<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once __DIR__ . '/config.php';

$userId = (int)($_POST['user_id'] ?? $_GET['user_id'] ?? 0);
if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '用户参数无效'], JSON_UNESCAPED_UNICODE);
    exit;
}

$conn = null;
try {
    $conn = getDBConnection();
    $conn->beginTransaction();
    $stmt = $conn->prepare('SELECT id, name FROM playlists WHERE user_id = ? ORDER BY id ASC');
    $stmt->execute([$userId]);
    $playlists = [];
    $duplicatesIgnored = 0;

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $playlist) {
        $songStmt = $conn->prepare('SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY added_at ASC, id ASC');
        $songStmt->execute([$playlist['id']]);
        $songs = [];
        $seenSongs = [];
        $duplicateIds = [];
        foreach ($songStmt->fetchAll(PDO::FETCH_ASSOC) as $song) {
            $songId = (string)($song['song_id'] ?? $song['id'] ?? '');
            $source = strtolower((string)($song['source'] ?? 'netease'));
            $songKey = $source . "\0" . $songId;
            if ($songId === '' || isset($seenSongs[$songKey])) {
                if (isset($seenSongs[$songKey])) {
                    $duplicatesIgnored++;
                    $duplicateIds[] = (int)$song['id'];
                }
                continue;
            }
            $seenSongs[$songKey] = true;
            $songs[] = [
                'id' => $songId,
                'source' => $source,
                'name' => (string)($song['song_title'] ?? $song['name'] ?? '未知歌曲'),
                'artist' => (string)($song['song_artist'] ?? $song['artist'] ?? '未知歌手'),
                'album' => (string)($song['song_album'] ?? $song['album'] ?? '未知专辑'),
                'pic_id' => (string)($song['song_cover'] ?? $song['pic_id'] ?? ''),
                'added_at' => (string)($song['added_at'] ?? ''),
                'playlist_added_at' => (string)($song['added_at'] ?? ''),
            ];
        }
        foreach (array_chunk($duplicateIds, 500) as $ids) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $deleteDuplicates = $conn->prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND id IN ($placeholders)");
            $deleteDuplicates->execute(array_merge([(int)$playlist['id']], $ids));
        }
        $playlists[(string)$playlist['name']] = $songs;
    }

    $conn->commit();

    echo json_encode([
        'success' => true,
        'playlists' => $playlists,
        'duplicates_ignored' => $duplicatesIgnored,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $error) {
    if ($conn instanceof PDO && $conn->inTransaction()) $conn->rollBack();
    error_log('Playlist loading failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '歌单读取失败'], JSON_UNESCAPED_UNICODE);
}
