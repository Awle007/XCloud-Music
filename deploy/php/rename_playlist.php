<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once 'config.php';

$userId = $_POST['user_id'] ?? '';
$oldName = $_POST['old_name'] ?? '';
$newName = $_POST['new_name'] ?? '';

if (empty($userId) || empty($oldName) || empty($newName)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

try {
    $conn = getDBConnection();
    
    // 开始事务
    $conn->beginTransaction();
    
    // 查找旧歌单
    $stmt = $conn->prepare("SELECT id FROM playlists WHERE user_id = ? AND name = ?");
    $stmt->execute([$userId, $oldName]);
    $playlist = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$playlist) {
        echo json_encode(['success' => false, 'message' => '原歌单不存在']);
        $conn->rollBack();
        exit;
    }
    
    // 检查新名称是否已存在
    $stmt = $conn->prepare("SELECT id FROM playlists WHERE user_id = ? AND name = ?");
    $stmt->execute([$userId, $newName]);
    $existingPlaylist = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($existingPlaylist) {
        echo json_encode(['success' => false, 'message' => '新歌单名称已存在']);
        $conn->rollBack();
        exit;
    }
    
    // 更新歌单名称
    $stmt = $conn->prepare("UPDATE playlists SET name = ? WHERE id = ?");
    $stmt->execute([$newName, $playlist['id']]);
    
    // 提交事务
    $conn->commit();
    
    echo json_encode([
        'success' => true,
        'message' => '歌单重命名成功'
    ]);
} catch (PDOException $e) {
    // 回滚事务
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 