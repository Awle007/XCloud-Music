<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'config.php';

$token = $_POST['token'] ?? '';

try {
    if (!empty($token)) {
        $conn = getDBConnection();
        
        // 删除token
        $stmt = $conn->prepare("DELETE FROM user_tokens WHERE token = ?");
        $stmt->execute([$token]);
    }
    
    echo json_encode([
        'success' => true,
        'message' => '已成功注销'
    ]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 