<?php
// 包含配置文件
require_once (is_file(__DIR__ . '/../../php/config.php') ? __DIR__ . '/../../php/config.php' : __DIR__ . '/../../deploy/php/config.php');

/**
 * 获取所有用户信息
 * 
 * @return array 所有用户信息
 */
function getAllUsers() {
    try {
        $conn = getDBConnection();
        
        $stmt = $conn->prepare("
            SELECT u.id, u.username, u.email, u.password, u.avatar, u.last_login, u.created_at, u.email_verified_status
            FROM users u
            ORDER BY u.id DESC
        ");
        $stmt->execute();
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        return [];
    }
}

/**
 * 获取用户总数
 * 
 * @return int 用户总数
 */
function getTotalUsers() {
    try {
        $conn = getDBConnection();
        
        $stmt = $conn->prepare("SELECT COUNT(*) FROM users");
        $stmt->execute();
        
        return $stmt->fetchColumn();
    } catch (PDOException $e) {
        return 0;
    }
}

/**
 * 获取今日注册用户数量
 * 
 * @return int 今日注册用户数
 */
function getTodayRegistrations() {
    try {
        $conn = getDBConnection();
        
        $stmt = $conn->prepare("SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()");
        $stmt->execute();
        
        return $stmt->fetchColumn();
    } catch (PDOException $e) {
        return 0;
    }
}

/**
 * 获取今日登录用户数量
 * 
 * @return int 今日登录用户数
 */
function getTodayLogins() {
    try {
        $conn = getDBConnection();
        
        $stmt = $conn->prepare("
            SELECT COUNT(DISTINCT user_id) 
            FROM login_logs 
            WHERE DATE(login_time) = CURDATE()
        ");
        $stmt->execute();
        
        return $stmt->fetchColumn();
    } catch (PDOException $e) {
        return 0;
    }
}

/**
 * 获取播放历史中的音乐源使用统计。
 *
 * listen_history 会合并同一用户、歌曲和来源的记录，因此这里使用
 * listen_count 求和作为播放次数，并统计每个来源的独立听众数。
 *
 * @return array{total_plays:int, sources:array<int, array<string, mixed>>}
 */
function getPlaybackSourceStats() {
    $emptyResult = [
        'total_plays' => 0,
        'sources' => []
    ];

    try {
        $conn = getDBConnection();
        $tableStmt = $conn->query("SHOW TABLES LIKE 'listen_history'");
        if (!$tableStmt || !$tableStmt->fetchColumn()) {
            return $emptyResult;
        }

        $stmt = $conn->prepare("
            SELECT
                CASE LOWER(TRIM(source))
                    WHEN 'kuwo_backup' THEN 'kuwo'
                    WHEN '' THEN 'unknown'
                    ELSE LOWER(TRIM(source))
                END AS source_key,
                SUM(GREATEST(listen_count, 1)) AS play_count,
                COUNT(DISTINCT user_id) AS listener_count
            FROM listen_history
            WHERE listened_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY source_key
            ORDER BY play_count DESC
        ");
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $sourceNames = [
            'kuwo' => '酷我音乐',
            'qq' => 'QQ音乐',
            'netease' => '网易云音乐',
            'kugou' => '酷狗音乐',
            'joox' => 'JOOX',
            'unknown' => '未知来源'
        ];
        $totalPlays = array_sum(array_map(static function ($row) {
            return (int)$row['play_count'];
        }, $rows));

        $sources = array_map(static function ($row) use ($sourceNames, $totalPlays) {
            $source = (string)$row['source_key'];
            $plays = (int)$row['play_count'];
            return [
                'source' => $source,
                'name' => $sourceNames[$source] ?? strtoupper($source),
                'play_count' => $plays,
                'listener_count' => (int)$row['listener_count'],
                'percentage' => $totalPlays > 0 ? round($plays * 100 / $totalPlays, 2) : 0
            ];
        }, $rows);

        return [
            'total_plays' => $totalPlays,
            'sources' => $sources
        ];
    } catch (PDOException $e) {
        return $emptyResult;
    }
}

/**
 * 获取过去7天每天的登录用户数量
 * 
 * @return array 日期=>用户数的数组
 */
function getLoginStatsForLastWeek() {
    try {
        $conn = getDBConnection();
        
        // 获取过去7天的日期
        $result = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $result[$date] = 0;
        }
        
        // 查询每天的登录用户数
        $stmt = $conn->prepare("
            SELECT 
                DATE(login_time) as login_date,
                COUNT(DISTINCT user_id) as login_count
            FROM 
                login_logs
            WHERE 
                login_time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY 
                DATE(login_time)
        ");
        $stmt->execute();
        
        // 填充结果
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $result[$row['login_date']] = (int)$row['login_count'];
        }
        
        return $result;
    } catch (PDOException $e) {
        // 返回空结果
        $result = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $result[$date] = 0;
        }
        return $result;
    }
}

/**
 * 获取单个用户详细信息
 * 
 * @param int $userId 用户ID
 * @return array|bool 用户信息数组或失败时返回false
 */
function getUserById($userId) {
    try {
        $conn = getDBConnection();
        
        $stmt = $conn->prepare("
            SELECT id, username, email, password, avatar, last_login, created_at, email_verified_status
            FROM users
            WHERE id = :id
        ");
        $stmt->bindParam(':id', $userId);
        $stmt->execute();
        
        return $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * 更新用户信息
 * 
 * @param int $userId 用户ID
 * @param array $userData 用户数据
 * @return array 操作结果
 */
function updateUser($userId, $userData) {
    try {
        $conn = getDBConnection();
        
        // 检查用户名和邮箱是否已存在
        if (!empty($userData['username'])) {
            $stmt = $conn->prepare("SELECT id FROM users WHERE username = :username AND id != :id");
            $stmt->bindParam(':username', $userData['username']);
            $stmt->bindParam(':id', $userId);
            $stmt->execute();
            
            if ($stmt->rowCount() > 0) {
                return [
                    'success' => false,
                    'message' => '用户名已存在'
                ];
            }
        }
        
        if (!empty($userData['email'])) {
            $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email AND id != :id");
            $stmt->bindParam(':email', $userData['email']);
            $stmt->bindParam(':id', $userId);
            $stmt->execute();
            
            if ($stmt->rowCount() > 0) {
                return [
                    'success' => false,
                    'message' => '邮箱已存在'
                ];
            }
        }
        
        // 构建更新SQL
        $updateFields = [];
        $params = [':id' => $userId];
        
        if (!empty($userData['username'])) {
            $updateFields[] = "username = :username";
            $params[':username'] = $userData['username'];
        }
        
        if (!empty($userData['email'])) {
            $updateFields[] = "email = :email";
            $params[':email'] = $userData['email'];
        }
        
        if (!empty($userData['password'])) {
            $updateFields[] = "password = :password";
            $params[':password'] = password_hash($userData['password'], PASSWORD_DEFAULT);
        }
        
        // 如果没有要更新的字段
        if (empty($updateFields)) {
            return [
                'success' => false,
                'message' => '没有提供要更新的数据'
            ];
        }
        
        // 执行更新
        $sql = "UPDATE users SET " . implode(", ", $updateFields) . " WHERE id = :id";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        
        return [
            'success' => true,
            'message' => '用户信息已成功更新'
        ];
    } catch (PDOException $e) {
        return [
            'success' => false,
            'message' => '更新失败: ' . $e->getMessage()
        ];
    }
}

/**
 * 记录用户登录
 * 
 * @param int $userId 用户ID
 * @return bool 操作结果
 */
function logUserLogin($userId) {
    try {
        $conn = getDBConnection();
        
        // 更新用户的最后登录时间
        $stmt = $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = :id");
        $stmt->bindParam(':id', $userId);
        $stmt->execute();
        
        // 记录登录日志
        $stmt = $conn->prepare("
            INSERT INTO login_logs (user_id, login_time, ip_address, user_agent)
            VALUES (:user_id, NOW(), :ip_address, :user_agent)
        ");
        $stmt->bindParam(':user_id', $userId);
        $stmt->bindParam(':ip_address', $_SERVER['REMOTE_ADDR']);
        $stmt->bindParam(':user_agent', $_SERVER['HTTP_USER_AGENT']);
        $stmt->execute();
        
        return true;
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * 获取最近登录的用户
 * 
 * @param int $limit 限制结果数量
 * @return array 最近登录的用户
 */
function getRecentLogins($limit = 10) {
    try {
        $conn = getDBConnection();
        
        $stmt = $conn->prepare("
            SELECT u.id, u.username, u.email, u.avatar, l.login_time, l.ip_address
            FROM login_logs l
            JOIN users u ON l.user_id = u.id
            ORDER BY l.login_time DESC
            LIMIT :limit
        ");
        $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        return [];
    }
}

/**
 * 设置用户邮箱验证状态
 * 
 * @param int $userId 用户ID
 * @param int $status 状态值(0=无需验证, 1=待验证, 2=已验证)
 * @return bool 操作结果
 */
function setUserEmailVerifyStatus($userId, $status) {
    try {
        $conn = getDBConnection();
        
        // 更新用户邮箱验证状态
        $stmt = $conn->prepare("UPDATE users SET email_verified_status = ? WHERE id = ?");
        $stmt->execute([$status, $userId]);
        
        // 如果是重置为"无需验证"，则删除验证码
        if ($status == 0) {
            $stmt = $conn->prepare("DELETE FROM email_verification_codes WHERE user_id = ?");
            $stmt->execute([$userId]);
        }
        
        return true;
    } catch (PDOException $e) {
        return false;
    }
}
?>
