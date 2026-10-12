<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('register');


require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_security.php';
xcloudSecurityRequirePost();

$action = (string)($_POST['action'] ?? 'register');
$username = trim((string)($_POST['username'] ?? ''));
$password = (string)($_POST['password'] ?? '');
$email = xcloudSecurityNormalizeEmail((string)($_POST['email'] ?? ''));
$code = trim((string)($_POST['verification_code'] ?? ''));
$ip = xcloudSecurityClientIp();
xcloudSecurityRateLimit('register-ip', $ip, 10, 3600);

try {
    $conn = getDBConnection();
    if ($action === 'resend_code') {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) xcloudSecurityError('邮箱格式不正确');
        xcloudSecurityRateLimit('register-resend-email', $email, 4, 3600);
        $stmt = $conn->prepare('SELECT id, username FROM users WHERE email = ? AND email_verified_status = 1 LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $verificationCode = xcloudSecurityVerificationCode();
            $conn->prepare('DELETE FROM email_verification_codes WHERE user_id = ?')->execute([$user['id']]);
            $conn->prepare('INSERT INTO email_verification_codes (user_id, email, code, expire) VALUES (?, ?, ?, ?)')
                ->execute([$user['id'], $email, $verificationCode, time() + 300]);
            sendVerificationEmail($email, $verificationCode, (string)$user['username'], 'register');
        }
        xcloudSecurityJson(['success' => true, 'message' => '如果账号需要验证，验证码将发送到该邮箱']);
    }

    if ($action !== 'register') xcloudSecurityError('未知操作');
    if (mb_strlen($username) < 5 || mb_strlen($username) > 50) xcloudSecurityError('用户名长度应为 5 到 50 位');
    if (!xcloudSecurityValidPassword($password)) xcloudSecurityError('密码长度应为 8 到 128 位');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) xcloudSecurityError('邮箱格式不正确');
    if (!preg_match('/^\d{6}$/', $code)) xcloudSecurityError('验证码无效或已过期');
    xcloudSecurityRateLimit('register-email', $email, 5, 3600);

    $stmt = $conn->prepare('SELECT 1 FROM users WHERE username = ? OR email = ? LIMIT 1');
    $stmt->execute([$username, $email]);
    if ($stmt->fetchColumn()) xcloudSecurityError('用户名或邮箱已被使用', 409);
    $stmt = $conn->prepare('SELECT id, code FROM register_verification_codes WHERE email = ? AND expire > ? ORDER BY id DESC LIMIT 1');
    $stmt->execute([$email, time()]);
    $verification = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$verification || !hash_equals((string)$verification['code'], $code)) xcloudSecurityError('验证码无效或已过期');

    $token = bin2hex(random_bytes(32));
    $conn->beginTransaction();
    $conn->prepare('INSERT INTO users (username, password, email, email_verified_status, last_login) VALUES (?, ?, ?, 2, NOW())')
        ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $email]);
    $userId = (int)$conn->lastInsertId();
    $conn->prepare('INSERT INTO playlists (user_id, name) VALUES (?, ?)')->execute([$userId, '默认播放列表']);
    $conn->prepare('DELETE FROM register_verification_codes WHERE id = ?')->execute([$verification['id']]);
    $conn->prepare('INSERT INTO login_logs (user_id, login_time, ip_address, user_agent) VALUES (?, NOW(), ?, ?)')
        ->execute([$userId, $ip, substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 1000)]);
    $conn->prepare('INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
        ->execute([$userId, $token, date('Y-m-d H:i:s', time() + 30 * 86400)]);
    $conn->commit();

    xcloudSecurityJson([
        'success' => true,
        'message' => '注册成功，已自动登录',
        'user' => ['id' => $userId, 'username' => $username, 'email' => $email],
        'token' => $token,
        'auto_login' => true,
    ]);
} catch (Throwable $error) {
    if (isset($conn) && $conn->inTransaction()) $conn->rollBack();
    xcloudSecurityLog($error, 'register');
    xcloudSecurityError('注册服务暂时不可用', 503);
}
