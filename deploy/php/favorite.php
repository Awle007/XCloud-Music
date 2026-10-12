<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once 'config.php';

$action = $_POST['action'] ?? ''; // add 或 remove
$userId = $_POST['user_id'] ?? '';
$songId = $_POST['song_id'] ?? '';
$songTitle = $_POST['song_title'] ?? '';
$songArtist = $_POST['song_artist'] ?? '';
$songCover = $_POST['song_cover'] ?? '';
$songSource = $_POST['source'] ?? 'netease';
$songAlbum = $_POST['album'] ?? '';

if (empty($action) || empty($userId) || empty($songId)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

try {
    $conn = getDBConnection();
    
    if ($action === 'add') {
        // 添加收藏
        $stmt = $conn->prepare("INSERT INTO favorites (user_id, song_id, source, song_title, song_artist, song_cover, song_album) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE song_title = VALUES(song_title), song_artist = VALUES(song_artist), song_cover = VALUES(song_cover), song_album = VALUES(song_album)");
        $stmt->execute([$userId, $songId, $songSource, $songTitle, $songArtist, $songCover, $songAlbum]);
        $message = '收藏成功';
    } else if ($action === 'remove') {
        // 取消收藏
        $stmt = $conn->prepare("DELETE FROM favorites WHERE user_id = ? AND song_id = ? AND source = ?");
        $stmt->execute([$userId, $songId, $songSource]);
        $message = '取消收藏成功';
    } else if ($action === 'update') {
        // 更新收藏的歌曲信息（封面和专辑）
        $stmt = $conn->prepare("UPDATE favorites SET song_cover = ?, song_album = ? WHERE user_id = ? AND song_id = ? AND source = ?");
        $stmt->execute([$songCover, $songAlbum, $userId, $songId, $songSource]);
        $message = '歌曲信息更新成功';
    } else {
        echo json_encode(['success' => false, 'message' => '无效的操作']);
        exit;
    }
    
    echo json_encode(['success' => true, 'message' => $message]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 