<?php
declare(strict_types=1);

function xcloudEnv(string $name, ?string $default = null): string {
    $value = getenv($name);
    if ($value !== false && trim((string)$value) !== '') return trim((string)$value);
    if ($default !== null) return $default;
    throw new RuntimeException("Missing {$name}");
}

function fail(string $message): never { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
function assertSameValue(mixed $expected, mixed $actual, string $message): void { if ($expected !== $actual) fail($message); }

$directory = sys_get_temp_dir() . '/xcloud-feedback-test-' . bin2hex(random_bytes(4));
putenv('FEEDBACK_ARCHIVE_DIR=' . $directory);
require_once __DIR__ . '/../deploy/php/feedback_archive.php';

try {
    $zone = new DateTimeZone('Asia/Shanghai');
    $path = xcloudFeedbackAppend('希望增加歌单排序', '', new DateTimeImmutable('2026-09-16 23:59:00', $zone));
    xcloudFeedbackAppend('深色主题文字看不清', 'user@example.com', new DateTimeImmutable('2026-09-16 23:59:01', $zone));
    assertSameValue('2026-09-16.ndjson', basename($path), 'archive date name is incorrect');
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    assertSameValue(2, count($lines), 'archive must contain both records');
    $first = json_decode($lines[0], true, 512, JSON_THROW_ON_ERROR);
    $second = json_decode($lines[1], true, 512, JSON_THROW_ON_ERROR);
    assertSameValue(['submitted_at', 'message', 'email'], array_keys($first), 'archive record fields are incorrect');
    assertSameValue('', $first['email'], 'empty email must be preserved as empty');
    assertSameValue('user@example.com', $second['email'], 'provided email must be preserved');
    echo "PASS: feedback archive\n";
} finally {
    if (is_dir($directory)) {
        foreach (glob($directory . '/*') ?: [] as $file) unlink($file);
        rmdir($directory);
    }
}
