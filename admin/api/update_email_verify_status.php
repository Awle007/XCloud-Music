<?php
// 包含认证和用户函数文件
require_once '../includes/auth.php';
require_once '../includes/user_functions.php';

// 确保管理员已登录
requireAdminLogin();

// 响应头
header('Content-Type: application/json');

// 获取参数
$userId = $_POST['user_id'] ?? 0;
$status = $_POST['status'] ?? null;
$action = $_POST['action'] ?? '';

if (empty($userId) || $status === null || empty($action)) {
    echo json_encode(['success' => false, 'message' => '参数错误']);
    exit;
}

// 验证用户是否存在
$user = getUserById($userId);
if (!$user) {
    echo json_encode(['success' => false, 'message' => '用户不存在']);
    exit;
}

// 根据操作设置不同的状态
switch ($action) {
    case 'verify':
        // 标记为需要验证
        if (setUserEmailVerifyStatus($userId, 1)) {
            echo json_encode([
                'success' => true, 
                'message' => '已成功将用户标记为待验证状态',
                'status' => 1,
                'status_text' => '<span class="badge bg-warning">待验证</span>'
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => '操作失败']);
        }
        break;
        
    case 'reset':
        // 重置为无需验证
        if (setUserEmailVerifyStatus($userId, 0)) {
            echo json_encode([
                'success' => true, 
                'message' => '已成功将用户重置为无需验证状态',
                'status' => 0,
                'status_text' => '<span class="badge bg-secondary">无需验证</span>'
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => '操作失败']);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'message' => '未知操作']);
} 