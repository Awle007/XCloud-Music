<?php
declare(strict_types=1);

function fail(string $message): never { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
function assertSameValue(mixed $expected, mixed $actual, string $message): void { if ($expected !== $actual) fail($message); }
function assertTrueValue(bool $value, string $message): void { if (!$value) fail($message); }

require_once __DIR__ . '/../deploy/php/send_feedback_digest.php';

$archiveDirectory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'xcloud-feedback-digest-' . bin2hex(random_bytes(6));
if (!mkdir($archiveDirectory, 0700, true) && !is_dir($archiveDirectory)) fail('Unable to create archive fixture directory');
try {
    foreach (['2026-09-15', '2026-09-16', '2026-09-17'] as $date) {
        file_put_contents($archiveDirectory . DIRECTORY_SEPARATOR . $date . '.ndjson', "{\"message\":\"fixture\"}\n");
    }
    file_put_contents($archiveDirectory . DIRECTORY_SEPARATOR . '2026-09-15.sent.json', '{}');
    $pending = xcloudFeedbackPendingArchives(
        $archiveDirectory,
        new DateTimeImmutable('2026-09-17 12:00:00', new DateTimeZone('Asia/Shanghai'))
    );
    assertSameValue(['2026-09-16.ndjson'], array_map('basename', $pending), 'only prior unsent archives should be selected');
} finally {
    foreach (glob($archiveDirectory . DIRECTORY_SEPARATOR . '*') ?: [] as $fixture) unlink($fixture);
    rmdir($archiveDirectory);
}

$body = xcloudFeedbackDigestBody([
    ['message' => '希望增加歌单排序', 'email' => 'user@example.com'],
    ['message' => '深色主题文字看不清', 'email' => ''],
]);
assertSameValue("XCloud音乐今日反馈内容如下：\n1. 希望增加歌单排序。  联系邮箱：user@example.com\n2. 深色主题文字看不清。  联系邮箱：无", $body, 'digest body format is incorrect');

$html = xcloudFeedbackDigestHtml([
    ['message' => "希望增加歌单排序\n并支持拖动", 'email' => 'user@example.com'],
    ['message' => '<script>alert(1)</script>', 'email' => ''],
], '2026-09-16');
assertTrueValue(str_contains($html, 'XCloud音乐反馈日报'), 'digest HTML title is missing');
assertTrueValue(str_contains($html, '希望增加歌单排序<br'), 'digest HTML must retain line breaks');
assertTrueValue(str_contains($html, 'user@example.com'), 'digest HTML email is missing');
assertTrueValue(str_contains($html, '&lt;script&gt;alert(1)&lt;/script&gt;'), 'digest HTML must escape feedback content');
echo "PASS: feedback digest\n";
