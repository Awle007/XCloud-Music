<?php
// 显示所有错误
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// 包含认证和用户函数文件
require_once '../includes/auth.php';
require_once '../includes/user_functions.php';

// 检查管理员是否已登录
if (!isAdminLoggedIn()) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => '未授权的请求'
    ]);
    exit;
}

// 检查请求方法
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => '不支持的请求方法'
    ]);
    exit;
}

// 检查是否提供了用户ID
$userId = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($userId <= 0) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => '无效的用户ID'
    ]);
    exit;
}

// 获取用户信息
try {
    $user = getUserById($userId);
    
    if ($user === false) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => '用户不存在'
        ]);
        exit;
    }
    
    // 隐藏密码散列
    unset($user['password']);
    
    // 返回用户信息
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'user' => $user
    ]);
} catch (Exception $e) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => '获取用户数据错误: ' . $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
}
?> 