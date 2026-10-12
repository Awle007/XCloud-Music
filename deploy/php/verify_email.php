<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_security.php';
xcloudSecurityRequirePost();

$action = (string)($_POST['action'] ?? '');
$userId = (int)($_POST['user_id'] ?? 0);
$code = trim((string)($_POST['code'] ?? ''));
$requestedEmail = xcloudSecurityNormalizeEmail((string)($_POST['email'] ?? $_POST['temp_email'] ?? ''));
$currentPassword = (string)($_POST['current_password'] ?? '');
if ($action === '' || $userId <= 0) xcloudSecurityError('参数不完整');

$ip = xcloudSecurityClientIp();
xcloudSecurityRateLimit('verify-email-ip', $ip, 20, 3600);
xcloudSecurityRateLimit('verify-email-user', (string)$userId, 12, 3600);

try {
    $conn = getDBConnection();
    $stmt = $conn->prepare('SELECT id, username, email, password, avatar, email_verified_status FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) xcloudSecurityError('用户不存在', 404);

    if ($action === 'update_email' || ($action === 'send_code' && $requestedEmail !== '')) {
        xcloudSecurityRateLimit('verify-email-change', (string)$userId . '|' . $ip, 5, 3600);
        if ($currentPassword === '' || !password_verify($currentPassword, $user['password'])) {
            xcloudSecurityError('当前密码错误', 401);
        }
        if (!filter_var($requestedEmail, FILTER_VALIDATE_EMAIL)) xcloudSecurityError('邮箱格式不正确');
        if (xcloudVerifyEmailExists($conn, $requestedEmail, $userId)) xcloudSecurityError('该邮箱已被其他账号使用', 409);
        xcloudVerifySendCode($conn, $user, $requestedEmail);
        xcloudSecurityJson(['success' => true, 'message' => '验证码已发送到新邮箱', 'email' => $requestedEmail]);
    }

    if ($action === 'send_code') {
        $targetEmail = xcloudSecurityNormalizeEmail((string)$user['email']);
        if (!filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) xcloudSecurityError('账号邮箱格式不正确');
        xcloudVerifySendCode($conn, $user, $targetEmail);
        xcloudSecurityJson(['success' => true, 'message' => '验证码已发送到账号邮箱']);
    }

    if ($action === 'verify_code') {
        if (!preg_match('/^\d{6}$/', $code)) xcloudSecurityError('验证码无效或已过期');
        $stmt = $conn->prepare('SELECT id, email, code FROM email_verification_codes WHERE user_id = ? AND expire > ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$userId, time()]);
        $verification = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$verification || !hash_equals((string)$verification['code'], $code)) xcloudSecurityError('验证码无效或已过期');

        $verifiedEmail = xcloudSecurityNormalizeEmail((string)$verification['email']);
        if (xcloudVerifyEmailExists($conn, $verifiedEmail, $userId)) xcloudSecurityError('该邮箱已被其他账号使用', 409);

        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + 30 * 86400);
        $conn->beginTransaction();
        $conn->prepare('UPDATE users SET email = ?, email_verified_status = 2, last_login = NOW() WHERE id = ?')->execute([$verifiedEmail, $userId]);
        $conn->prepare('DELETE FROM email_verification_codes WHERE user_id = ?')->execute([$userId]);
        $conn->prepare('DELETE FROM user_tokens WHERE user_id = ?')->execute([$userId]);
        $conn->prepare('INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')->execute([$userId, $token, $expiresAt]);
        $conn->commit();

        xcloudSecurityJson([
            'success' => true,
            'message' => '邮箱验证成功',
            'user' => [
                'id' => $userId,
                'username' => (string)$user['username'],
                'email' => $verifiedEmail,
                'avatar' => (string)($user['avatar'] ?? ''),
            ],
            'token' => $token,
            'auto_login' => true,
        ]);
    }

    xcloudSecurityError('未知操作');
} catch (Throwable $error) {
    if (isset($conn) && $conn->inTransaction()) $conn->rollBack();
    xcloudSecurityLog($error, 'verify email');
    xcloudSecurityError('邮箱验证服务暂时不可用', 503);
}

function xcloudVerifyEmailExists(PDO $conn, string $email, int $excludeUserId): bool
{
    $stmt = $conn->prepare('SELECT 1 FROM users WHERE email = ? AND id != ? LIMIT 1');
    $stmt->execute([$email, $excludeUserId]);
    return (bool)$stmt->fetchColumn();
}

function xcloudVerifySendCode(PDO $conn, array $user, string $targetEmail): void
{
    $verificationCode = xcloudSecurityVerificationCode();
    $conn->beginTransaction();
    $conn->prepare('DELETE FROM email_verification_codes WHERE user_id = ?')->execute([$user['id']]);
    $conn->prepare('INSERT INTO email_verification_codes (user_id, email, code, expire) VALUES (?, ?, ?, ?)')
        ->execute([$user['id'], $targetEmail, $verificationCode, time() + 300]);
    $conn->commit();
    if (!sendVerificationEmail($targetEmail, $verificationCode, (string)$user['username'])) {
        $conn->prepare('DELETE FROM email_verification_codes WHERE user_id = ?')->execute([$user['id']]);
        xcloudSecurityError('验证邮件发送失败，请稍后重试', 503);
    }
}
