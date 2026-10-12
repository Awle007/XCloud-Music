<?php
declare(strict_types=1);

function fail(string $message): never { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
function assertSameValue(mixed $expected, mixed $actual, string $message): void { if ($expected !== $actual) fail($message); }
function assertTrueValue(bool $value, string $message): void { if (!$value) fail($message); }

putenv('DB_USER=test');
putenv('DB_PASS=test');
putenv('DB_NAME=test');
require_once __DIR__ . '/../admin/includes/auth.php';

$_SESSION = [];
$token = adminCsrfToken();
assertTrueValue(preg_match('/^[a-f0-9]{64}$/', $token) === 1, 'CSRF token format is incorrect');
assertSameValue($token, adminCsrfToken(), 'CSRF token must remain stable within the session');
assertTrueValue(verifyAdminCsrfToken($token), 'valid CSRF token was rejected');
assertTrueValue(!verifyAdminCsrfToken(str_repeat('0', 64)), 'invalid CSRF token was accepted');
assertTrueValue(!verifyAdminCsrfToken(''), 'empty CSRF token was accepted');

assertTrueValue(adminRequestIsSameOrigin([
    'HTTP_HOST' => 'music.example.com',
    'HTTP_ORIGIN' => 'https://music.example.com',
    'HTTPS' => 'on',
]), 'matching HTTPS origin was rejected');
assertTrueValue(adminRequestIsSameOrigin([
    'HTTP_HOST' => 'music.example.com',
    'HTTP_REFERER' => 'https://music.example.com/admin/',
    'HTTPS' => 'on',
]), 'matching referer was rejected');
assertTrueValue(!adminRequestIsSameOrigin([
    'HTTP_HOST' => 'music.example.com',
    'HTTP_ORIGIN' => 'https://attacker.example',
    'HTTPS' => 'on',
]), 'cross-origin request was accepted');
assertTrueValue(!adminRequestIsSameOrigin(['HTTP_HOST' => 'music.example.com', 'HTTPS' => 'on']), 'request without origin evidence was accepted');

echo "PASS: feedback admin security\n";
