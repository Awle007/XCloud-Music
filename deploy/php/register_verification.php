<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('register');


require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_security.php';
xcloudSecurityRequirePost();

$action = (string)($_POST['action'] ?? '');
$email = xcloudSecurityNormalizeEmail((string)($_POST['email'] ?? ''));
$code = trim((string)($_POST['code'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) xcloudSecurityError('邮箱格式不正确');

$ip = xcloudSecurityClientIp();
xcloudSecurityRateLimit('register-verification-ip', $ip, 20, 3600);
xcloudSecurityRateLimit('register-verification-email', $email, $action === 'send_code' ? 5 : 12, 3600);

try {
    $conn = getDBConnection();
    if ($action === 'send_code') {
        $stmt = $conn->prepare('SELECT 1 FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        if ($stmt->fetchColumn()) xcloudSecurityError('该邮箱已被使用', 409);

        $verificationCode = (string)random_int(100000, 999999);
        $expire = time() + 600;
        $conn->beginTransaction();
        $conn->prepare('DELETE FROM register_verification_codes WHERE email = ?')->execute([$email]);
        $conn->prepare('INSERT INTO register_verification_codes (email, code, expire) VALUES (?, ?, ?)')->execute([$email, $verificationCode, $expire]);
        $conn->commit();

        if (!sendVerificationEmail($email, $verificationCode, '新用户', 'register')) {
            $conn->prepare('DELETE FROM register_verification_codes WHERE email = ?')->execute([$email]);
            xcloudSecurityError('验证邮件发送失败，请稍后重试', 503);
        }
        xcloudSecurityJson(['success' => true, 'message' => '验证码已发送到 ' . xcloudRegisterHideEmail($email)]);
    }

    if ($action === 'verify_code') {
        if (!preg_match('/^\d{6}$/', $code)) xcloudSecurityError('验证码格式不正确');
        $stmt = $conn->prepare('SELECT id FROM register_verification_codes WHERE email = ? AND code = ? AND expire > ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$email, $code, time()]);
        $id = $stmt->fetchColumn();
        if (!$id) xcloudSecurityError('验证码无效或已过期', 400);
        xcloudSecurityJson(['success' => true, 'message' => '验证成功']);
    }

    xcloudSecurityError('未知操作');
} catch (Throwable $error) {
    if (isset($conn) && $conn->inTransaction()) $conn->rollBack();
    xcloudSecurityLog($error, 'register verification');
    xcloudSecurityError('验证服务暂时不可用', 503);
}

function xcloudRegisterHideEmail(string $email): string
{
    [$name, $domain] = explode('@', $email, 2);
    $visible = substr($name, 0, 1);
    return $visible . str_repeat('*', max(1, strlen($name) - 1)) . '@' . $domain;
}
