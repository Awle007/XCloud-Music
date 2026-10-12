<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once 'config.php';

// 获取POST数据
$userId = $_POST['user_id'] ?? '';
$currentPassword = $_POST['current_password'] ?? '';
$newPassword = $_POST['new_password'] ?? '';

if (empty($userId) || empty($currentPassword) || empty($newPassword)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

try {
    $conn = getDBConnection();
    
    // 验证用户当前密码
    $stmt = $conn->prepare("SELECT password FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        echo json_encode(['success' => false, 'message' => '用户不存在']);
        exit;
    }
    
    if (!password_verify($currentPassword, $user['password'])) {
        echo json_encode(['success' => false, 'message' => '当前密码错误']);
        exit;
    }
    
    // 更新密码
    $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
    $stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
    $stmt->execute([$hashedPassword, $userId]);
    
    // 清除所有已有的token，强制其他设备重新登录
    $stmt = $conn->prepare("DELETE FROM user_tokens WHERE user_id = ?");
    $stmt->execute([$userId]);
    
    echo json_encode([
        'success' => true,
        'message' => '密码修改成功，请重新登录'
    ]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 