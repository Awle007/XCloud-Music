<?php
declare(strict_types=1);

require_once __DIR__ . '/../php/_features.php';
xcloudRequireFeature('heartMode');
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../php/config.php';

try {
    $db = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME, DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $stmt = $db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'heart_mode_migrations'");
    if ((int)$stmt->fetchColumn() !== 1) throw new RuntimeException('migration missing');
    echo json_encode(['success' => true, 'status' => 'OK'], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    error_log('heart mode health check failed: ' . $error->getMessage());
    http_response_code(503);
    echo json_encode(['success' => false, 'status' => 'DATABASE_UNAVAILABLE', 'message' => 'heart mode database is unavailable'], JSON_UNESCAPED_UNICODE);
}
