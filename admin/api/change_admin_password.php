<?php
// 包含认证文件
require_once '../includes/auth.php';

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

// 获取POST数据
$currentPassword = isset($_POST['currentPassword']) ? $_POST['currentPassword'] : '';
$newPassword = isset($_POST['newPassword']) ? $_POST['newPassword'] : '';

// 验证密码
if (empty($currentPassword) || empty($newPassword)) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => '当前密码和新密码都不能为空'
    ]);
    exit;
}

// 执行密码修改
$result = changeAdminPassword($_SESSION['admin_id'], $currentPassword, $newPassword);

// 返回结果
header('Content-Type: application/json');
echo json_encode($result);
?> 