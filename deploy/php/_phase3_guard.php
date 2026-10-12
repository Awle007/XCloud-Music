<?php
declare(strict_types=1);
require_once __DIR__ . '/_env.php';

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

function xcloudPhase3JsonError(string $message, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function xcloudPhase3BearerToken(): string
{
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim($header), $matches)) return strtolower($matches[1]);
    return '';
}

function xcloudPhase3Input(): array
{
    $input = $_POST;
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) $input = array_merge($input, $json);
    }
    return $input;
}

function xcloudPhase3RequireUserToken(): void
{
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    if (xcloudEnv('XCLOUD_PHASE3_AUTH', '1') === '0') return;

    $input = xcloudPhase3Input();
    $userId = (int)($input['user_id'] ?? $_GET['user_id'] ?? 0);
    $token = xcloudPhase3BearerToken();
    if ($token === '') {
        $compatibleToken = strtolower(trim((string)($input['token'] ?? $_GET['token'] ?? '')));
        if (preg_match('/^[a-f0-9]{64}$/', $compatibleToken)) $token = $compatibleToken;
    }
    if ($userId <= 0 || $token === '') xcloudPhase3JsonError('登录状态无效，请重新登录', 401);

    try {
        require_once __DIR__ . '/config.php';
        $conn = getDBConnection();
        $stmt = $conn->prepare('SELECT 1 FROM user_tokens WHERE user_id = ? AND token = ? AND expires_at > NOW() LIMIT 1');
        $stmt->execute([$userId, $token]);
        if (!$stmt->fetchColumn()) xcloudPhase3JsonError('登录已过期，请重新登录', 401);
    } catch (Throwable $error) {
        error_log('Phase 3 token validation failed: ' . $error->getMessage());
        xcloudPhase3JsonError('账户服务暂时不可用', 503);
    }
}
