<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
$features = xcloudConfiguredFeatures();
if (!$features['login'] && !$features['hotToplist'] && !$features['feedback']) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['success' => true, 'skipped' => true]);
    exit;
}


require_once __DIR__ . '/_security.php';
xcloudSecurityRequirePost();
require_once __DIR__ . '/config.php';

$visitorId = trim((string)($_POST['visitor_id'] ?? ''));
$clientType = strtolower(trim((string)($_POST['client_type'] ?? '')));

if (!preg_match('/^[a-z0-9_-]{20,128}$/i', $visitorId)) {
    xcloudSecurityError('无效的匿名访客标识');
}
if (!in_array($clientType, ['web', 'desktop', 'android'], true)) {
    xcloudSecurityError('无效的客户端来源');
}

$visitorHash = hash_hmac('sha256', $visitorId, DB_PASS . "\0xcloud-client-entry-v1");
xcloudSecurityRateLimit('client-entry-visitor', $visitorHash, 24, 300);
xcloudSecurityRateLimit('client-entry-ip', xcloudSecurityClientIp(), 600, 300);

try {
    $conn = getDBConnection();
    $stmt = $conn->prepare(
        'INSERT INTO client_entry_stats (visit_date, visitor_hash, client_type, visit_count, first_seen_at, last_seen_at, last_counted_at)
         VALUES (CURDATE(), ?, ?, 1, NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           visit_count = IF(last_counted_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE), visit_count + 1, visit_count),
           last_seen_at = NOW(),
           last_counted_at = IF(last_counted_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE), NOW(), last_counted_at)',
    );
    $stmt->execute([$visitorHash, $clientType]);
    xcloudSecurityJson(['success' => true]);
} catch (PDOException $error) {
    error_log('[XCloud analytics] ' . $error->getMessage());
    xcloudSecurityError('访问统计服务暂不可用', 503);
}
