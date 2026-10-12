<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
// 包含主配置文件
require_once (is_file(__DIR__ . '/../../php/config.php') ? __DIR__ . '/../../php/config.php' : __DIR__ . '/../../deploy/php/config.php');

// 更新users表，添加last_login字段
function updateUsersTable() {
    $conn = getDBConnection();
    
    // 检查users表是否有last_login字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `users` LIKE 'last_login'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `users` ADD COLUMN `last_login` DATETIME DEFAULT NULL AFTER `avatar`");
        echo "已添加last_login字段到users表<br>";
    }
}

// 创建管理员表
function createAdminsTable() {
    $conn = getDBConnection();
    
    // 管理员表
    $conn->exec("CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        last_login DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    
    echo "已创建admins表<br>";
    
    // 检查是否已经存在管理员账户
    $stmt = $conn->prepare("SELECT COUNT(*) FROM admins");
    $stmt->execute();
    $adminCount = $stmt->fetchColumn();
    
    // 如果没有管理员账户，创建默认管理员账户
    if ($adminCount == 0) {
        // 使用安全的密码哈希
        $username = xcloudEnv('ADMIN_USERNAME');
        $password = xcloudEnv('ADMIN_PASSWORD');
        if (strlen($password) < 12 || in_array($password, ['change-me-before-install', 'your_admin_password'], true)) throw new RuntimeException('ADMIN_PASSWORD 必须设置为至少 12 位的独立密码');
        $defaultPassword = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $conn->prepare("INSERT INTO admins (username, password) VALUES (:username, :password)");
        $stmt->bindParam(':username', $username);
        $stmt->bindParam(':password', $defaultPassword);
        $stmt->execute();
        
        echo "已创建配置中的管理员账户。<br>";
    }
}

// 创建用户登录记录表
function createLoginLogsTable() {
    $conn = getDBConnection();
    
    // 用户登录记录表
    $conn->exec("CREATE TABLE IF NOT EXISTS login_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        login_time DATETIME NOT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        user_agent TEXT DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    
    echo "已创建login_logs表<br>";
}

function createClientEntryStatsTable() {
    $conn = getDBConnection();
    $conn->exec("CREATE TABLE IF NOT EXISTS client_entry_stats (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        visit_date DATE NOT NULL,
        visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        client_type VARCHAR(16) NOT NULL,
        visit_count INT UNSIGNED NOT NULL DEFAULT 1,
        first_seen_at DATETIME NOT NULL,
        last_seen_at DATETIME NOT NULL,
        last_counted_at DATETIME NOT NULL,
        UNIQUE KEY uniq_client_entry_daily (visit_date, visitor_hash, client_type),
        KEY idx_client_entry_date_type (visit_date, client_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "已创建访问来源统计表<br>";
}

// 初始化管理员系统所需的数据库结构
function initAdminDatabase() {
    try {
        updateUsersTable();
        createAdminsTable();
        createLoginLogsTable();
        createClientEntryStatsTable();
        
        echo "管理员系统数据库初始化完成！";
    } catch (PDOException $e) {
        throw new RuntimeException('管理员数据库初始化失败', 0, $e);
    }
}

// 执行初始化
initAdminDatabase();
?> 
