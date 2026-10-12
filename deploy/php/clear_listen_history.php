<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once __DIR__ . '/config.php';

$input = xcloudPhase3Input();
$userId = (int)($input['user_id'] ?? 0);
if ($userId <= 0) xcloudPhase3JsonError('缺少用户 ID', 400);

try {
    $conn = getDBConnection();
    $stmt = $conn->prepare('DELETE FROM listen_history WHERE user_id = ?');
    $stmt->execute([$userId]);
    echo json_encode([
        'success' => true,
        'deleted' => (int)$stmt->rowCount(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('Clear listen history failed: ' . $error->getMessage());
    xcloudPhase3JsonError('清空听歌历史失败，请稍后重试', 500);
}
