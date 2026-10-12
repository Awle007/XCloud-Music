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
    
    // 查询指定名称的歌单ID
    $stmt = $conn->prepare("SELECT id FROM playlists WHERE user_id = ? AND name = ?");
    $stmt->execute([$userId, $playlistName]);
    $playlist = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($playlist) {
        echo json_encode([
            'success' => true,
            'playlist_id' => $playlist['id']
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => '歌单不存在']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 