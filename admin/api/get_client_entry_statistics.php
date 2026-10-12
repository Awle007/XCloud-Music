<?php
require_once '../includes/auth.php';
requireAdminLogin();

header('Content-Type: application/json; charset=utf-8');

$days = isset($_GET['days']) ? (int)$_GET['days'] : 30;
$days = min(max($days, 7), 90);
$types = ['web', 'desktop', 'android'];

function emptyDailyStats(int $days, array $types): array {
    $result = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $result[$date] = ['date' => $date];
        foreach ($types as $type) {
            $result[$date][$type] = ['visits' => 0, 'unique_visitors' => 0];
        }
    }
    return $result;
}

try {
    $conn = getDBConnection();
    $daily = emptyDailyStats($days, $types);
    $summary = array_fill_keys($types, ['visits' => 0, 'unique_visitors' => 0]);
    $todaySummary = array_fill_keys($types, ['visits' => 0, 'unique_visitors' => 0]);

    $table = $conn->query("SHOW TABLES LIKE 'client_entry_stats'");
    if (!$table || !$table->fetchColumn()) {
        echo json_encode([
            'success' => true,
            'table_ready' => false,
            'days' => $days,
            'summary' => $summary,
            'today_summary' => $todaySummary,
            'daily_stats' => array_values($daily),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $dateSql = 'DATE_SUB(CURDATE(), INTERVAL ' . ($days - 1) . ' DAY)';
    $dailyRows = $conn->query(
        "SELECT visit_date, client_type, SUM(visit_count) AS visits, COUNT(*) AS unique_visitors
         FROM client_entry_stats
         WHERE visit_date >= $dateSql
         GROUP BY visit_date, client_type"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($dailyRows as $row) {
        $date = (string)$row['visit_date'];
        $type = (string)$row['client_type'];
        if (isset($daily[$date][$type])) {
            $daily[$date][$type] = [
                'visits' => (int)$row['visits'],
                'unique_visitors' => (int)$row['unique_visitors'],
            ];
        }
    }
    $todaySummary = $daily[date('Y-m-d')] ?? $todaySummary;
    unset($todaySummary['date']);

    $summaryRows = $conn->query(
        "SELECT client_type, SUM(visit_count) AS visits, COUNT(DISTINCT visitor_hash) AS unique_visitors
         FROM client_entry_stats
         WHERE visit_date >= $dateSql
         GROUP BY client_type"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($summaryRows as $row) {
        $type = (string)$row['client_type'];
        if (isset($summary[$type])) {
            $summary[$type] = [
                'visits' => (int)$row['visits'],
                'unique_visitors' => (int)$row['unique_visitors'],
            ];
        }
    }

    echo json_encode([
        'success' => true,
        'table_ready' => true,
        'days' => $days,
        'summary' => $summary,
        'today_summary' => $todaySummary,
        'daily_stats' => array_values($daily),
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $error) {
    error_log('[XCloud awle analytics] ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '获取访问来源统计失败'], JSON_UNESCAPED_UNICODE);
}
