<?php
// 启动会话
session_start();

// 同时支持发布目录（awle 与 php 同级）和源码目录。
$configPaths = [
    __DIR__ . '/../../php/config.php',
    __DIR__ . '/../../deploy/php/config.php',
];
$configPath = null;
foreach ($configPaths as $candidate) {
    if (is_file($candidate)) {
        $configPath = $candidate;
        break;
    }
}
if ($configPath === null) throw new RuntimeException('XCloud configuration is unavailable');
require_once $configPath;

/**
 * 验证管理员登录凭据
 * 
 * @param string $username 用户名
 * @param string $password 密码
 * @return array 登录结果
 */
function adminLogin($username, $password) {
    try {
        $conn = getDBConnection();
        
        // 查询管理员账户
        $stmt = $conn->prepare("SELECT id, username, password FROM admins WHERE username = :username");
        $stmt->bindParam(':username', $username);
        $stmt->execute();
        
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // 验证管理员存在并且密码正确
        if ($admin && password_verify($password, $admin['password'])) {
            // 更新最后登录时间
            $updateStmt = $conn->prepare("UPDATE admins SET last_login = NOW() WHERE id = :id");
            $updateStmt->bindParam(':id', $admin['id']);
            $updateStmt->execute();
            
            // 设置会话变量
            $_SESSION['admin_id'] = $admin['id'];
            $_SESSION['admin_username'] = $admin['username'];
            $_SESSION['admin_last_activity'] = time();
            
            return [
                'success' => true,
                'message' => '登录成功'
            ];
        } else {
            return [
                'success' => false,
                'message' => '用户名或密码不正确'
            ];
        }
    } catch (PDOException $e) {
        return [
            'success' => false,
            'message' => '登录失败: ' . $e->getMessage()
        ];
    }
}

/**
 * 检查管理员是否已登录
 * 
 * @return bool 是否已登录
 */
function isAdminLoggedIn() {
    // 检查会话变量
    if (isset($_SESSION['admin_id']) && isset($_SESSION['admin_username'])) {
        // 检查会话是否过期（30分钟）
        if (isset($_SESSION['admin_last_activity']) && (time() - $_SESSION['admin_last_activity'] < 1800)) {
            // 更新最后活动时间
            $_SESSION['admin_last_activity'] = time();
            return true;
        } else {
            // 会话过期，清除会话
            adminLogout();
            return false;
        }
    }
    
    return false;
}

/**
 * 管理员退出登录
 * 
 * @return void
 */
function adminLogout() {
    // 清除所有会话变量
    $_SESSION = array();
    
    // 销毁会话
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    
    session_destroy();
}

/**
 * 确保管理员已登录，否则重定向到登录页面
 * 
 * @return void
 */
function requireAdminLogin() {
    if (!isAdminLoggedIn()) {
        header('Location: login.php');
        exit;
    }
}

function adminCsrfToken(): string {
    if (!isset($_SESSION['admin_csrf_token']) || !is_string($_SESSION['admin_csrf_token'])) {
        $_SESSION['admin_csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['admin_csrf_token'];
}

function verifyAdminCsrfToken(string $token): bool {
    return $token !== ''
        && isset($_SESSION['admin_csrf_token'])
        && is_string($_SESSION['admin_csrf_token'])
        && hash_equals($_SESSION['admin_csrf_token'], $token);
}

function adminRequestIsSameOrigin(?array $server = null): bool {
    $server ??= $_SERVER;
    $host = strtolower(trim((string)($server['HTTP_HOST'] ?? '')));
    if ($host === '') return false;
    $source = trim((string)($server['HTTP_ORIGIN'] ?? $server['HTTP_REFERER'] ?? ''));
    if ($source === '') return false;
    $parts = parse_url($source);
    if (!is_array($parts) || !isset($parts['host'])) return false;
    $sourceHost = strtolower((string)$parts['host']);
    if (isset($parts['port'])) $sourceHost .= ':' . (int)$parts['port'];
    return hash_equals($host, $sourceHost);
}

/**
 * 修改管理员密码
 * 
 * @param int $adminId 管理员ID
 * @param string $currentPassword 当前密码
 * @param string $newPassword 新密码
 * @return array 操作结果
 */
function changeAdminPassword($adminId, $currentPassword, $newPassword) {
    try {
        $conn = getDBConnection();
        
        // 查询当前管理员账户
        $stmt = $conn->prepare("SELECT password FROM admins WHERE id = :id");
        $stmt->bindParam(':id', $adminId);
        $stmt->execute();
        
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // 验证当前密码正确
        if ($admin && password_verify($currentPassword, $admin['password'])) {
            // 更新密码
            $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
            $updateStmt = $conn->prepare("UPDATE admins SET password = :password WHERE id = :id");
            $updateStmt->bindParam(':password', $hashedPassword);
            $updateStmt->bindParam(':id', $adminId);
            $updateStmt->execute();
            
            return [
                'success' => true,
                'message' => '密码已成功更新'
            ];
        } else {
            return [
                'success' => false,
                'message' => '当前密码不正确'
            ];
        }
    } catch (PDOException $e) {
        return [
            'success' => false,
            'message' => '密码更新失败: ' . $e->getMessage()
        ];
    }
}
?> 