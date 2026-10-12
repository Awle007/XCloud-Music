<?php
// 包含必要文件
require_once '../includes/auth.php';

// 确保管理员已登录
requireAdminLogin();

// 设置JSON响应头
header('Content-Type: application/json');

// 获取请求参数
$days = isset($_GET['days']) ? intval($_GET['days']) : 30; // 默认30天
$days = min(max($days, 7), 90); // 限制在7-90天之间

try {
    $conn = getDBConnection();
    
    // 生成日期范围（过去N天每一天）
    $dateRange = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $dateRange[$date] = [
            'date' => $date,
            'total_logins' => 0,
            'unique_users' => 0
        ];
    }
    
    // 查询总登录次数
    $stmt = $conn->prepare("
        SELECT 
            DATE(login_time) as login_date, 
            COUNT(*) as total_logins
        FROM 
            login_logs
        WHERE 
            login_time >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
        GROUP BY 
            DATE(login_time)
    ");
    $stmt->bindParam(':days', $days, PDO::PARAM_INT);
    $stmt->execute();
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (isset($dateRange[$row['login_date']])) {
            $dateRange[$row['login_date']]['total_logins'] = (int)$row['total_logins'];
        }
    }
    
    // 查询独立登录用户数
    $stmt = $conn->prepare("
        SELECT 
            DATE(login_time) as login_date, 
            COUNT(DISTINCT user_id) as unique_users
        FROM 
            login_logs
        WHERE 
            login_time >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
        GROUP BY 
            DATE(login_time)
    ");
    $stmt->bindParam(':days', $days, PDO::PARAM_INT);
    $stmt->execute();
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (isset($dateRange[$row['login_date']])) {
            $dateRange[$row['login_date']]['unique_users'] = (int)$row['unique_users'];
        }
    }
    
    // 获取用户总数和活跃用户数
    $stmt = $conn->prepare("SELECT COUNT(*) FROM users");
    $stmt->execute();
    $totalUsers = $stmt->fetchColumn();
    
    $stmt = $conn->prepare("
        SELECT COUNT(DISTINCT user_id) 
        FROM login_logs 
        WHERE login_time >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
    ");
    $stmt->bindParam(':days', $days, PDO::PARAM_INT);
    $stmt->execute();
    $activeUsers = $stmt->fetchColumn();
    
    // 获取最活跃的用户（登录次数最多）
    $stmt = $conn->prepare("
        SELECT 
            u.id, u.username, COUNT(l.id) as login_count
        FROM 
            login_logs l
        JOIN 
            users u ON l.user_id = u.id
        WHERE 
            l.login_time >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
        GROUP BY 
            l.user_id
        ORDER BY 
            login_count DESC
        LIMIT 5
    ");
    $stmt->bindParam(':days', $days, PDO::PARAM_INT);
    $stmt->execute();
    $topUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // 返回结果
    echo json_encode([
        'success' => true,
        'days' => $days,
        'daily_stats' => array_values($dateRange),
        'total_users' => $totalUsers,
        'active_users' => $activeUsers,
        'active_percentage' => $totalUsers > 0 ? round(($activeUsers / $totalUsers) * 100, 1) : 0,
        'top_users' => $topUsers
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => '获取统计数据失败: ' . $e->getMessage()
    ]);
} 