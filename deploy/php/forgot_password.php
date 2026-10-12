<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_security.php';
xcloudSecurityRequirePost();

$action = (string)($_POST['action'] ?? '');
$email = xcloudSecurityNormalizeEmail((string)($_POST['email'] ?? ''));
$code = trim((string)($_POST['code'] ?? ''));
$newPassword = (string)($_POST['new_password'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) xcloudSecurityError('邮箱格式不正确');

$ip = xcloudSecurityClientIp();
xcloudSecurityRateLimit('forgot-password-ip', $ip, 15, 3600);
xcloudSecurityRateLimit('forgot-password-email', $email, $action === 'send_code' ? 4 : 10, 3600);

try {
    $conn = getDBConnection();
    if ($action === 'send_code') {
        $stmt = $conn->prepare('SELECT id, username FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $verificationCode = xcloudSecurityVerificationCode();
            $conn->prepare('REPLACE INTO password_resets (email, code, expire) VALUES (?, ?, ?)')
                ->execute([$email, $verificationCode, time() + 300]);
            if (!sendVerificationEmail($email, $verificationCode, (string)$user['username'], 'reset')) {
                $conn->prepare('DELETE FROM password_resets WHERE email = ?')->execute([$email]);
                xcloudSecurityLog(new RuntimeException('Mail delivery failed'), 'forgot password mail');
            }
        }
        xcloudSecurityJson(['success' => true, 'message' => '如果该邮箱已注册，验证码将发送到该邮箱']);
    }

    if ($action === 'reset_password') {
        if (!preg_match('/^\d{6}$/', $code)) xcloudSecurityError('验证码无效或已过期');
        if (!xcloudSecurityValidPassword($newPassword)) xcloudSecurityError('新密码长度应为 8 到 128 位');

        $stmt = $conn->prepare('SELECT code, expire FROM password_resets WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $reset = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$reset || !hash_equals((string)$reset['code'], $code) || (int)$reset['expire'] < time()) {
            xcloudSecurityError('验证码无效或已过期', 400);
        }

        $stmt = $conn->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $userId = (int)$stmt->fetchColumn();
        if ($userId <= 0) xcloudSecurityError('验证码无效或已过期', 400);

        $conn->beginTransaction();
        $conn->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([password_hash($newPassword, PASSWORD_DEFAULT), $userId]);
        $conn->prepare('DELETE FROM password_resets WHERE email = ?')->execute([$email]);
        $conn->prepare('DELETE FROM user_tokens WHERE user_id = ?')->execute([$userId]);
        $conn->commit();
        xcloudSecurityJson(['success' => true, 'message' => '密码重置成功，请重新登录']);
    }

    xcloudSecurityError('未知操作');
} catch (Throwable $error) {
    if (isset($conn) && $conn->inTransaction()) $conn->rollBack();
    xcloudSecurityLog($error, 'forgot password');
    xcloudSecurityError('密码重置服务暂时不可用', 503);
}
