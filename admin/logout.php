<?php
// 包含认证文件
require_once 'includes/auth.php';

// 执行退出登录
adminLogout();

// 重定向到登录页面
header('Location: login.php');
exit;
?> 