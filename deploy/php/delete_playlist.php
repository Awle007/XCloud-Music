<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once 'config.php';

$userId = $_POST['user_id'] ?? '';
$playlistName = $_POST['playlist_name'] ?? '';

if (empty($userId) || empty($playlistName)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

try {
    $conn = getDBConnection();
    
    // 开始事务
    $conn->beginTransaction();
    
    // 查找歌单ID
    $stmt = $conn->prepare("SELECT id FROM playlists WHERE user_id = ? AND name = ?");
    $stmt->execute([$userId, $playlistName]);
    $playlist = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$playlist) {
        echo json_encode(['success' => false, 'message' => '歌单不存在']);
        $conn->rollBack();
        exit;
    }
    
    $playlistId = $playlist['id'];
    
    // 删除歌单中的歌曲
    $stmt = $conn->prepare("DELETE FROM playlist_songs WHERE playlist_id = ?");
    $stmt->execute([$playlistId]);
    
    // 删除歌单
    $stmt = $conn->prepare("DELETE FROM playlists WHERE id = ?");
    $stmt->execute([$playlistId]);
    
    // 提交事务
    $conn->commit();
    
    echo json_encode([
        'success' => true,
        'message' => '歌单删除成功'
    ]);
} catch (PDOException $e) {
    // 回滚事务
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 