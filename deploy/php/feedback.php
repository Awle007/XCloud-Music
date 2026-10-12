<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('feedback');

require_once __DIR__ . '/_security.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/feedback_archive.php';

xcloudSecurityRequirePost();
if (!str_starts_with(strtolower((string)($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) xcloudSecurityError('请求格式不正确', 415);
try {
    $payload = json_decode(file_get_contents('php://input') ?: '', true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($payload)) xcloudSecurityError('请求格式不正确', 400);
    $message = (string)($payload['message'] ?? '');
    $email = (string)($payload['email'] ?? '');
    xcloudSecurityRateLimit('feedback', xcloudSecurityClientIp(), 3, 600);
    xcloudFeedbackAppend($message, $email);
    xcloudSecurityJson(['success' => true, 'message' => '感谢你的反馈']);
} catch (InvalidArgumentException $error) {
    xcloudSecurityError($error->getMessage(), 422);
} catch (Throwable $error) {
    xcloudSecurityLog($error, 'feedback submission');
    xcloudSecurityError('服务暂时不可用，请稍后再试', 503);
}
