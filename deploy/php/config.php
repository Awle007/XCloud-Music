<?php
// 数据库配置
// 请将以下信息替换为您在宝塔面板中看到的实际数据库信息
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/_env.php';

define('DB_HOST', xcloudEnv('DB_HOST', '127.0.0.1'));
define('DB_USER', xcloudEnv('DB_USER'));  // 替换为宝塔创建的数据库用户名
define('DB_PASS', xcloudEnv('DB_PASS'));  // 替换为宝塔提供的实际密码
define('DB_NAME', xcloudEnv('DB_NAME'));  // 替换为宝塔创建的数据库名称

// 创建数据库连接
function getDBConnection() {
    try {
        $conn = new PDO(
            "mysql:host=" . DB_HOST . ";port=" . xcloudEnv('DB_PORT', '3306') . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER,
            DB_PASS
        );
        $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $conn;
    } catch(PDOException $e) {
        if (PHP_SAPI === 'cli') {
            fwrite(STDERR, "数据库服务暂时不可用，请检查连接配置。\n");
            exit(1);
        }
        // 检查是否已经发送了HTTP头
        if (!headers_sent()) {
            header('Content-Type: application/json');
        }
        echo json_encode(['success' => false, 'message' => '数据库服务暂时不可用']);
        exit;
    }
}

// 创建必要的数据库表
function createTables() {
    $conn = getDBConnection();
    
    // 用户表
    $conn->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    
    // 用户令牌表（用于记住登录）
    $conn->exec("CREATE TABLE IF NOT EXISTS user_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(100) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    
    // 播放列表表
    $conn->exec("CREATE TABLE IF NOT EXISTS playlists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE KEY unique_playlist (user_id, name)
    )");
    
    // 播放列表歌曲表
    $conn->exec("CREATE TABLE IF NOT EXISTS playlist_songs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        playlist_id INT NOT NULL,
        song_id VARCHAR(50) NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'netease',
        song_title VARCHAR(255) NOT NULL,
        song_artist VARCHAR(255) NOT NULL,
        song_cover VARCHAR(255) NOT NULL,
        song_album VARCHAR(255) DEFAULT '',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        UNIQUE KEY unique_playlist_song (playlist_id, song_id, source)
    )");
    
    // 收藏表
    $conn->exec("CREATE TABLE IF NOT EXISTS favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        song_id VARCHAR(50) NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'netease',
        song_title VARCHAR(255) NOT NULL,
        song_artist VARCHAR(255) NOT NULL,
        song_cover VARCHAR(255) NOT NULL,
        song_album VARCHAR(255) DEFAULT '',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE KEY unique_favorite (user_id, song_id, source)
    )");
    
    // 找回密码临时表
    $conn->exec("CREATE TABLE IF NOT EXISTS password_resets (
        email VARCHAR(255) PRIMARY KEY,
        code VARCHAR(10) NOT NULL,
        expire INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    // 注册验证码表（不使用外键约束）
    $conn->exec("CREATE TABLE IF NOT EXISTS register_verification_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expire INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    // 邮箱验证码表
    $conn->exec("CREATE TABLE IF NOT EXISTS email_verification_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expire INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    // 修改现有的email_verification_codes表，确保允许user_id为NULL
    try {
        $conn->exec("ALTER TABLE email_verification_codes MODIFY COLUMN user_id INT NULL");
    } catch (Exception $e) {
        // 忽略错误
    }
    
    // 检查是否需要更新表结构
    updateTablesIfNeeded($conn);
}

// 更新表结构函数 - 用于添加新字段
function updateTablesIfNeeded($conn) {
    // 检查 favorites 表是否有 source 字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `favorites` LIKE 'source'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `favorites` ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'netease' AFTER `song_id`");
        // 由于添加了source字段，需要更新唯一约束
        $conn->exec("ALTER TABLE `favorites` DROP INDEX `unique_favorite`");
        $conn->exec("ALTER TABLE `favorites` ADD UNIQUE KEY `unique_favorite` (`user_id`, `song_id`, `source`)");
    }
    
    // 检查 favorites 表是否有 song_album 字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `favorites` LIKE 'song_album'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `favorites` ADD COLUMN `song_album` VARCHAR(255) DEFAULT '' AFTER `song_cover`");
    }
    
    // 检查 playlist_songs 表是否有 source 字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `playlist_songs` LIKE 'source'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `playlist_songs` ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'netease' AFTER `song_id`");
        // 由于添加了source字段，需要更新唯一约束
        $conn->exec("ALTER TABLE `playlist_songs` DROP INDEX `unique_playlist_song`");
        $conn->exec("ALTER TABLE `playlist_songs` ADD UNIQUE KEY `unique_playlist_song` (`playlist_id`, `song_id`, `source`)");
    }
    
    // 检查 playlist_songs 表是否有 song_album 字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `playlist_songs` LIKE 'song_album'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `playlist_songs` ADD COLUMN `song_album` VARCHAR(255) DEFAULT '' AFTER `song_cover`");
    }
    
    // 检查 playlists 表是否有唯一约束
    $stmt = $conn->prepare("SHOW INDEX FROM `playlists` WHERE Key_name = 'unique_playlist'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `playlists` ADD UNIQUE KEY `unique_playlist` (`user_id`, `name`)");
    }
    
    // 检查 users 表是否有 avatar 字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `users` LIKE 'avatar'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `users` ADD COLUMN `avatar` VARCHAR(255) DEFAULT NULL AFTER `email`");
    }
    
    // 检查 users 表是否有 last_login 字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `users` LIKE 'last_login'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE `users` ADD COLUMN `last_login` DATETIME DEFAULT NULL AFTER `avatar`");
    }
    
    // 检查 users 表是否有 email_verified_status 字段
    $stmt = $conn->prepare("SHOW COLUMNS FROM `users` LIKE 'email_verified_status'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        // 添加邮箱验证状态字段: 0=无需验证, 1=待验证, 2=已验证
        $conn->exec("ALTER TABLE `users` ADD COLUMN `email_verified_status` TINYINT DEFAULT 0 AFTER `email`");
    }
    
    // 检查 login_logs 表是否存在
    $stmt = $conn->prepare("SHOW TABLES LIKE 'login_logs'");
    $stmt->execute();
    if ($stmt->rowCount() == 0) {
        $conn->exec("CREATE TABLE IF NOT EXISTS login_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address VARCHAR(45) DEFAULT NULL,
            user_agent TEXT DEFAULT NULL,
            login_result TINYINT(1) NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )");
    } else {
        // 确保login_time字段有默认值
        try {
            $conn->exec("ALTER TABLE login_logs MODIFY login_time DATETIME DEFAULT CURRENT_TIMESTAMP");
        } catch (Exception $e) {
            // 忽略错误
        }
    }
}

// 初始化数据库
if (xcloudEnv('XCLOUD_AUTO_MIGRATE', '0') === '1') createTables();
/**
 * 发送邮箱验证码
 * 
 * @param string $to 接收邮件地址
 * @param string $code 验证码
 * @param string $username 用户名
 * @param string $type 验证码类型（register=注册验证，verify=邮箱验证）
 * @return bool 发送结果
 */
function sendVerificationEmail($to, $code, $username, $type = 'verify') {
    require_once __DIR__ . '/vendor/autoload.php';
    require_once __DIR__ . '/email_templates.php';
    
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = xcloudEnv('SMTP_HOST');
        $mail->SMTPAuth = true;
        $mail->Username = xcloudEnv('SMTP_USERNAME');
        $mail->Password = xcloudEnv('SMTP_PASSWORD');
        $mail->SMTPSecure = 'ssl';
        $mail->Port = (int)xcloudEnv('SMTP_PORT', '465');
        $mail->setFrom(xcloudEnv('SMTP_FROM_ADDRESS', xcloudEnv('SMTP_USERNAME')), xcloudEnv('SMTP_FROM_NAME', 'XCloud音乐'));
        $mail->addAddress($to);
        $mail->CharSet = 'UTF-8';
        $content = xcloudVerificationEmailContent((string)$code, (string)$username, (string)$type);
        $mail->isHTML(true);
        $mail->Subject = $content['subject'];
        $mail->Body = $content['html'];
        $mail->AltBody = $content['text'];
        
        $mail->send();
        return true;
    } catch (Exception $e) {
        return false;
    }
}

/**
 * 生成验证码并保存到数据库
 * 
 * @param int $userId 用户ID
 * @param string $email 邮箱
 * @return string|false 成功返回验证码，失败返回false
 */
function generateAndSaveVerificationCode($userId, $email) {
    try {
        $conn = getDBConnection();
        $code = rand(100000, 999999); // 6位数字验证码
        $expire = time() + 300; // 5分钟有效期
        
        // 先删除旧的验证码
        $stmt = $conn->prepare("DELETE FROM email_verification_codes WHERE user_id = ?");
        $stmt->execute([$userId]);
        
        // 保存新验证码
        $stmt = $conn->prepare("INSERT INTO email_verification_codes (user_id, email, code, expire) VALUES (?, ?, ?, ?)");
        $stmt->execute([$userId, $email, $code, $expire]);
        
        return $code;
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * 验证邮箱验证码
 * 
 * @param int $userId 用户ID
 * @param string $code 验证码
 * @return bool 验证结果
 */
function verifyEmailCode($userId, $code) {
    try {
        $conn = getDBConnection();
        
        // 查询验证码
        $stmt = $conn->prepare("SELECT * FROM email_verification_codes WHERE user_id = ? AND code = ? AND expire > ?");
        $stmt->execute([$userId, $code, time()]);
        
        if ($stmt->rowCount() > 0) {
            // 验证通过，更新用户状态为"已验证"
            $stmt = $conn->prepare("UPDATE users SET email_verified_status = 2 WHERE id = ?");
            $stmt->execute([$userId]);
            
            // 删除已使用的验证码
            $stmt = $conn->prepare("DELETE FROM email_verification_codes WHERE user_id = ?");
            $stmt->execute([$userId]);
            
            return true;
        }
        return false;
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * 更新用户邮箱
 * 
 * @param int $userId 用户ID
 * @param string $newEmail 新邮箱
 * @return bool 更新结果
 */
function updateUserEmail($userId, $newEmail) {
    try {
        $conn = getDBConnection();
        
        // 检查新邮箱是否已被其他用户使用
        $stmt = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
        $stmt->execute([$newEmail, $userId]);
        
        if ($stmt->rowCount() > 0) {
            return false; // 邮箱已被使用
        }
        
        // 更新邮箱
        $stmt = $conn->prepare("UPDATE users SET email = ?, email_verified_status = 1 WHERE id = ?");
        $stmt->execute([$newEmail, $userId]);
        
        return true;
    } catch (PDOException $e) {
        return false;
    }
}
