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
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => '不支持的请求方法'
    ]);
    exit;
}

try {
    // 获取POST数据
    $userId = isset($_POST['userId']) ? (int)$_POST['userId'] : 0;
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $email = isset($_POST['email']) ? trim($_POST['email']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    
    // 验证用户ID
    if ($userId <= 0) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => '无效的用户ID'
        ]);
        exit;
    }
    
    // 验证用户名
    if (empty($username)) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => '用户名不能为空'
        ]);
        exit;
    }
    
    // 准备更新数据
    $userData = [
        'username' => $username
    ];
    
    if (!empty($email)) {
        $userData['email'] = $email;
    }
    
    if (!empty($password)) {
        $userData['password'] = $password;
    }
    
    // 执行更新
    $result = updateUser($userId, $userData);
    
    // 返回结果
    header('Content-Type: application/json');
    echo json_encode($result);
} catch (Exception $e) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => '更新用户数据错误: ' . $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
}
?> 