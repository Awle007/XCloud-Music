<?php
declare(strict_types=1);

function fail(string $message): never { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
function assertSameValue(mixed $expected, mixed $actual, string $message): void { if ($expected !== $actual) fail($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true)); }
function assertTrueValue(bool $value, string $message): void { if (!$value) fail($message); }

$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'xcloud-feedback-management-' . bin2hex(random_bytes(6));
if (!mkdir($directory, 0700, true) && !is_dir($directory)) fail('Unable to create fixture directory');
putenv('FEEDBACK_ARCHIVE_DIR=' . $directory);
function xcloudEnv(string $name, ?string $default = null): string
{
    $value = getenv($name);
    if ($value !== false && trim((string)$value) !== '') return trim((string)$value);
    if ($default !== null) return $default;
    throw new RuntimeException('Missing environment variable: ' . $name);
}
require_once __DIR__ . '/../deploy/php/feedback_archive.php';
require_once __DIR__ . '/../deploy/php/feedback_management.php';

try {
    file_put_contents($directory . DIRECTORY_SEPARATOR . '2026-09-17.ndjson', implode("\n", [
        json_encode(['submitted_at' => '2026-09-17T09:00:00+08:00', 'message' => '较早反馈', 'email' => 'early@example.com'], JSON_UNESCAPED_UNICODE),
        '{bad json',
        json_encode(['submitted_at' => '2026-09-17T10:00:00+08:00', 'message' => '字段不全'], JSON_UNESCAPED_UNICODE),
    ]) . "\n");
    file_put_contents($directory . DIRECTORY_SEPARATOR . '2026-09-18.ndjson', implode("\n", [
        json_encode(['submitted_at' => '2026-09-18T11:00:00+08:00', 'message' => '最新反馈', 'email' => 'latest@example.com'], JSON_UNESCAPED_UNICODE),
        json_encode(['submitted_at' => '2026-09-18T08:00:00+08:00', 'message' => '无邮箱反馈', 'email' => ''], JSON_UNESCAPED_UNICODE),
    ]) . "\n");
    file_put_contents($directory . DIRECTORY_SEPARATOR . 'notes.ndjson', "{}\n");

    $first = xcloudFeedbackPage($directory, 1, 2);
    assertSameValue(3, $first['total'], 'valid record total is incorrect');
    assertSameValue(2, $first['total_pages'], 'total pages are incorrect');
    assertSameValue(2, $first['invalid_count'], 'invalid lines must be counted');
    assertSameValue(['最新反馈', '无邮箱反馈'], array_column($first['items'], 'message'), 'page must be newest first');
    assertSameValue(false, $first['items'][0]['replied'], 'new feedback must start unreplied');

    $second = xcloudFeedbackPage($directory, 2, 2);
    assertSameValue(['较早反馈'], array_column($second['items'], 'message'), 'second page is incorrect');
    $stable = xcloudFeedbackPage($directory, 1, 2);
    assertSameValue($first['items'][0]['id'], $stable['items'][0]['id'], 'feedback ID must be stable');

    $found = xcloudFeedbackFind($directory, $first['items'][0]['id']);
    assertSameValue('latest@example.com', $found['email'] ?? null, 'lookup by ID failed');
    assertSameValue(null, xcloudFeedbackFind($directory, str_repeat('0', 64)), 'unknown ID must not resolve');

    xcloudFeedbackRecordReply($directory, $first['items'][0]['id'], new DateTimeImmutable('2026-09-18T12:00:00+08:00'));
    xcloudFeedbackRecordReply($directory, $first['items'][0]['id'], new DateTimeImmutable('2026-09-18T13:00:00+08:00'));
    file_put_contents($directory . DIRECTORY_SEPARATOR . 'state' . DIRECTORY_SEPARATOR . 'replies.ndjson', "{bad state\n", FILE_APPEND);

    $replied = xcloudFeedbackPage($directory, 1, 2);
    assertSameValue(true, $replied['items'][0]['replied'], 'successful reply state is missing');
    assertSameValue('2026-09-18T13:00:00+08:00', $replied['items'][0]['replied_at'], 'latest reply timestamp must win');
    assertTrueValue(is_file($directory . DIRECTORY_SEPARATOR . 'state' . DIRECTORY_SEPARATOR . 'replies.ndjson'), 'reply state file is missing');

    echo "PASS: feedback management\n";
} finally {
    $remove = static function (string $path) use (&$remove): void {
        if (is_dir($path)) {
            foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $entry) $remove($path . DIRECTORY_SEPARATOR . $entry);
            rmdir($path);
        } elseif (is_file($path)) {
            unlink($path);
        }
    };
    $remove($directory);
}
