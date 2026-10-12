<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once 'config.php';

$userId = $_POST['user_id'] ?? '';
$favoritesJson = $_POST['favorites'] ?? '';

if (empty($userId) || empty($favoritesJson)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

try {
    $conn = getDBConnection();
    $favorites = json_decode($favoritesJson, true);
    
    if (!is_array($favorites)) {
        echo json_encode(['success' => false, 'message' => '收藏数据格式错误']);
        exit;
    }
    
    // 开始事务
    $conn->beginTransaction();
    
    foreach ($favorites as $song) {
        // 检查必要字段
        if (empty($song['id']) || empty($song['source'])) {
            continue;
        }
        
        // 使用REPLACE INTO语句，如果存在则更新，不存在则插入
        $stmt = $conn->prepare("REPLACE INTO favorites 
                               (user_id, song_id, source, song_title, song_artist, song_cover, song_album) 
                               VALUES (?, ?, ?, ?, ?, ?, ?)");
        
        $title = isset($song['name']) ? $song['name'] : (isset($song['title']) ? $song['title'] : '未知歌曲');
        $artistValue = '';
        
        if (isset($song['artist'])) {
            $artistValue = is_array($song['artist']) ? implode(', ', $song['artist']) : $song['artist'];
        } else {
            $artistValue = '未知艺术家';
        }
        
        $stmt->execute([
            $userId,
            $song['id'],
            $song['source'],
            $title,
            $artistValue,
            $song['pic_id'] ?? '',
            $song['album'] ?? ''
        ]);
    }
    
    // 提交事务
    $conn->commit();
    
    echo json_encode([
        'success' => true,
        'message' => '收藏同步成功',
        'count' => count($favorites)
    ]);
} catch (PDOException $e) {
    // 回滚事务
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 