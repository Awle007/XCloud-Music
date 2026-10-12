<?php
declare(strict_types=1);

$servicePaths = [__DIR__ . '/../../php', __DIR__ . '/../../deploy/php'];
$serviceDirectory = null;
foreach ($servicePaths as $candidate) {
    if (is_file($candidate . '/feedback_reply.php')) {
        $serviceDirectory = $candidate;
        break;
    }
}
if ($serviceDirectory === null) feedbackReplyResponse(503, ['success' => false, 'message' => '反馈服务暂时不可用']);
require_once $serviceDirectory . '/_features.php';
xcloudRequireFeature('feedback');
require_once __DIR__ . '/../includes/auth.php';

header('Content-Type: application/json; charset=UTF-8');
function feedbackReplyResponse(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!isAdminLoggedIn()) feedbackReplyResponse(401, ['success' => false, 'message' => '未授权的请求']);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') feedbackReplyResponse(405, ['success' => false, 'message' => '不支持的请求方法']);
if (!adminRequestIsSameOrigin()) feedbackReplyResponse(403, ['success' => false, 'message' => '请求来源无效']);
$contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
if (!str_starts_with($contentType, 'application/json')) feedbackReplyResponse(415, ['success' => false, 'message' => '请求格式不正确']);

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) feedbackReplyResponse(400, ['success' => false, 'message' => '请求内容不正确']);
if (!verifyAdminCsrfToken((string)($payload['csrf_token'] ?? ''))) feedbackReplyResponse(403, ['success' => false, 'message' => '请求令牌无效，请刷新页面后重试']);
$feedbackId = trim((string)($payload['feedback_id'] ?? ''));
$reply = trim((string)($payload['reply'] ?? ''));
if (!preg_match('/^[a-f0-9]{64}$/', $feedbackId)) feedbackReplyResponse(400, ['success' => false, 'message' => '反馈记录无效']);
if ($reply === '' || mb_strlen($reply, 'UTF-8') > 4000) feedbackReplyResponse(400, ['success' => false, 'message' => '回复内容需为 1 至 4000 个字符']);

require_once $serviceDirectory . '/feedback_archive.php';
require_once $serviceDirectory . '/feedback_management.php';
require_once $serviceDirectory . '/feedback_reply.php';

try {
    $result = xcloudProcessFeedbackReply(xcloudFeedbackArchiveDirectory(), $feedbackId, $reply);
    feedbackReplyResponse(200, ['success' => true, 'message' => '回复邮件已发送'] + $result);
} catch (XCloudFeedbackReplyStateException $error) {
    error_log('[XCloud awle feedback reply state] ' . $error->getMessage() . ': ' . $error->getPrevious()?->getMessage());
    feedbackReplyResponse(409, ['success' => false, 'mail_sent' => true, 'message' => '邮件已发送，但状态保存失败']);
} catch (InvalidArgumentException $error) {
    feedbackReplyResponse(400, ['success' => false, 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[XCloud awle feedback reply] ' . $error->getMessage());
    feedbackReplyResponse(503, ['success' => false, 'message' => '回复邮件发送失败，请稍后重试']);
}
