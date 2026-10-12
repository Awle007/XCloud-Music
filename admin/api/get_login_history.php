<?php
// 包含必要的文件
require_once '../includes/auth.php';
require_once '../includes/user_functions.php';

// 确保管理员已登录
requireAdminLogin();

// 设置JSON响应头
header('Content-Type: application/json');

// 获取请求参数
$userId = isset($_GET['user_id']) ? intval($_GET['user_id']) : null;
$startDate = isset($_GET['start_date']) ? $_GET['start_date'] : null;
$endDate = isset($_GET['end_date']) ? $_GET['end_date'] : null;

try {
    $conn = getDBConnection();
    
    // 构建查询
    $sql = "SELECT l.id, l.user_id, u.username, l.login_time, l.ip_address, l.user_agent 
            FROM login_logs l
            JOIN users u ON l.user_id = u.id
            WHERE 1=1";
    $params = [];
    
    // 添加条件
    if ($userId) {
        $sql .= " AND l.user_id = :user_id";
        $params[':user_id'] = $userId;
    }
    
    if ($startDate) {
        $sql .= " AND DATE(l.login_time) >= :start_date";
        $params[':start_date'] = $startDate;
    }
    
    if ($endDate) {
        $sql .= " AND DATE(l.login_time) <= :end_date";
        $params[':end_date'] = $endDate;
    }
    
    // 添加排序
    $sql .= " ORDER BY l.login_time DESC";
    
    // 如果没有指定用户，限制结果数量
    if (!$userId) {
        $sql .= " LIMIT 100"; // 避免返回过多数据
    }
    
    $stmt = $conn->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->execute();
    
    $loginLogs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // 如果指定了用户ID，获取用户详情
    $userData = null;
    if ($userId) {
        $userData = getUserById($userId);
    }
    
    // 如果指定了用户ID，获取近30天登录统计
    $loginStats = null;
    if ($userId) {
        $loginStats = getUserLoginStats($userId, 30);
    }
    
    // 返回结果
    echo json_encode([
        'success' => true,
        'data' => $loginLogs,
        'user' => $userData,
        'stats' => $loginStats,
        'count' => count($loginLogs)
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => '获取登录记录失败: ' . $e->getMessage()
    ]);
}

/**
 * 获取用户的登录统计数据
 * 
 * @param int $userId 用户ID
 * @param int $days 天数
 * @return array 统计数据
 */
function getUserLoginStats($userId, $days = 30) {
    try {
        $conn = getDBConnection();
        
        // 初始化结果数组（过去30天每天的数据）
        $result = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $result[$date] = 0;
        }
        
        // 查询用户每天的登录次数
        $stmt = $conn->prepare("
            SELECT 
                DATE(login_time) as login_date,
                COUNT(*) as login_count
            FROM 
                login_logs
            WHERE 
                user_id = :user_id
                AND login_time >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
            GROUP BY 
                DATE(login_time)
        ");
        $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindParam(':days', $days, PDO::PARAM_INT);
        $stmt->execute();
        
        // 填充结果
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $result[$row['login_date']] = (int)$row['login_count'];
        }
        
        return $result;
    } catch (PDOException $e) {
        return null;
    }
} 