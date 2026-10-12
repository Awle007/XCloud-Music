<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';

header('Content-Type: application/json; charset=UTF-8');
if (!isAdminLoggedIn()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => '未授权的请求'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => '不支持的请求方法'], JSON_UNESCAPED_UNICODE);
    exit;
}

$servicePaths = [
    __DIR__ . '/../../php',
    __DIR__ . '/../../deploy/php',
];
$serviceDirectory = null;
foreach ($servicePaths as $candidate) {
    if (is_file($candidate . '/feedback_management.php')) {
        $serviceDirectory = $candidate;
        break;
    }
}
if ($serviceDirectory === null) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => '反馈服务暂时不可用'], JSON_UNESCAPED_UNICODE);
    exit;
}
require_once $serviceDirectory . '/feedback_archive.php';
require_once $serviceDirectory . '/feedback_management.php';

$page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) ?: 1;
try {
    $result = xcloudFeedbackPage(xcloudFeedbackArchiveDirectory(), (int)$page, 20);
    echo json_encode(['success' => true] + $result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    error_log('[XCloud awle feedback list] ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '反馈列表加载失败'], JSON_UNESCAPED_UNICODE);
}
