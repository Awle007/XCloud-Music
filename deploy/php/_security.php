<?php
declare(strict_types=1);

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

function xcloudSecurityJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function xcloudSecurityError(string $message, int $status = 400): void
{
    xcloudSecurityJson(['success' => false, 'message' => $message], $status);
}

function xcloudSecurityRequirePost(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        xcloudSecurityError('请求方式不正确', 405);
    }
}

function xcloudSecurityClientIp(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64);
}

function xcloudSecurityRateLimit(string $scope, string $identity, int $limit, int $windowSeconds): void
{
    $directory = dirname(__DIR__) . '/cache/rate_limits';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        error_log('XCloud rate-limit directory is not writable: ' . $directory);
        xcloudSecurityError('安全服务暂时不可用，请稍后重试', 503);
    }

    $key = hash('sha256', $scope . "\0" . strtolower(trim($identity)));
    $file = $directory . '/' . $key . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        error_log('XCloud rate-limit bucket is not writable: ' . $file);
        xcloudSecurityError('安全服务暂时不可用，请稍后重试', 503);
    }

    $now = time();
    $raw = stream_get_contents($handle);
    $attempts = json_decode($raw ?: '[]', true);
    if (!is_array($attempts)) $attempts = [];
    $attempts = array_values(array_filter($attempts, static fn($timestamp) => is_int($timestamp) && $timestamp > $now - $windowSeconds));

    if (count($attempts) >= $limit) {
        $retryAfter = max(1, $windowSeconds - ($now - (int)$attempts[0]));
        flock($handle, LOCK_UN);
        fclose($handle);
        header('Retry-After: ' . $retryAfter);
        xcloudSecurityError('操作过于频繁，请稍后重试', 429);
    }

    $attempts[] = $now;
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, json_encode($attempts));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function xcloudSecurityNormalizeEmail(string $email): string
{
    return strtolower(trim($email));
}

function xcloudSecurityVerificationCode(): string
{
    return (string)random_int(100000, 999999);
}

function xcloudSecurityValidPassword(string $password): bool
{
    $length = strlen($password);
    return $length >= 8 && $length <= 128;
}

function xcloudSecurityLog(Throwable $error, string $context): void
{
    error_log('[XCloud security] ' . $context . ': ' . $error->getMessage());
}
