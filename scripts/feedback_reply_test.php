<?php
declare(strict_types=1);

function fail(string $message): never { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
function assertSameValue(mixed $expected, mixed $actual, string $message): void { if ($expected !== $actual) fail($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true)); }
function assertTrueValue(bool $value, string $message): void { if (!$value) fail($message); }
function assertThrows(callable $callback, string $class, string $message): void { try { $callback(); } catch (Throwable $error) { if ($error instanceof $class) return; fail($message . ': got ' . $error::class); } fail($message . ': no exception'); }

$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'xcloud-feedback-reply-' . bin2hex(random_bytes(6));
if (!mkdir($directory, 0700, true) && !is_dir($directory)) fail('Unable to create fixture directory');
// 使用真实环境加载器，邮件传输仍使用下面的局部回调，不连接 SMTP。
require_once __DIR__ . '/../deploy/php/_env.php';
foreach (['LOGIN', 'REGISTER', 'HOT_TOPLIST', 'FEEDBACK', 'SOURCE_NETEASE', 'SOURCE_KUWO', 'SOURCE_QQ', 'SOURCE_KUGOU'] as $flag) putenv('XCLOUD_' . $flag . '_ENABLED=1');
putenv('XCLOUD_HEART_MODE_ENABLED=0');
require_once __DIR__ . '/../deploy/php/feedback_management.php';
require_once __DIR__ . '/../deploy/php/feedback_reply.php';

try {
    $content = xcloudFeedbackReplyContent("第一行\n<script>alert(1)</script>");
    assertSameValue('XCloud音乐反馈回复', $content['subject'], 'reply subject is incorrect');
    assertTrueValue(str_contains($content['html'], '第一行<br'), 'HTML must preserve line breaks');
    assertTrueValue(str_contains($content['html'], '&lt;script&gt;alert(1)&lt;/script&gt;'), 'HTML must escape reply text');
    assertTrueValue(!str_contains($content['html'], '<script>alert(1)</script>'), 'HTML contains unescaped reply text');
    assertTrueValue(str_contains($content['text'], "您好：\n感谢您为XCloud音乐提供问题反馈或建议"), 'plain text greeting is missing');
    assertTrueValue(str_ends_with($content['text'], "\n\nXCloud音乐"), 'plain text signature is missing');

    assertThrows(fn() => xcloudFeedbackReplyContent('   '), InvalidArgumentException::class, 'blank reply must be rejected');
    assertThrows(fn() => xcloudFeedbackReplyContent(str_repeat('a', 4001)), InvalidArgumentException::class, 'oversized reply must be rejected');

    file_put_contents($directory . DIRECTORY_SEPARATOR . '2026-09-18.ndjson', implode("\n", [
        json_encode(['submitted_at' => '2026-09-18T11:00:00+08:00', 'message' => '可回复', 'email' => 'user@example.com'], JSON_UNESCAPED_UNICODE),
        json_encode(['submitted_at' => '2026-09-18T12:00:00+08:00', 'message' => '无邮箱', 'email' => ''], JSON_UNESCAPED_UNICODE),
    ]) . "\n");
    $page = xcloudFeedbackPage($directory, 1, 20);
    $replyable = array_values(array_filter($page['items'], static fn(array $item): bool => $item['email'] !== ''))[0];
    $anonymous = array_values(array_filter($page['items'], static fn(array $item): bool => $item['email'] === ''))[0];

    assertThrows(
        fn() => xcloudProcessFeedbackReply($directory, $anonymous['id'], '回复', static fn() => true),
        InvalidArgumentException::class,
        'feedback without email must not be replyable'
    );

    $events = [];
    assertThrows(
        function () use ($directory, $replyable, &$events): void {
            xcloudProcessFeedbackReply($directory, $replyable['id'], '回复失败', static function () use (&$events): void {
                $events[] = 'send';
                throw new RuntimeException('SMTP failed');
            });
        },
        RuntimeException::class,
        'transport failure must propagate'
    );
    assertSameValue(['send'], $events, 'transport must be attempted once');
    assertSameValue(false, xcloudFeedbackPage($directory, 1, 20)['items'][1]['replied'], 'failed send must not record reply state');

    $captured = [];
    $result = xcloudProcessFeedbackReply(
        $directory,
        $replyable['id'],
        '处理完成',
        static function (string $to, array $mail) use (&$captured): void { $captured = [$to, $mail['subject']]; },
        new DateTimeImmutable('2026-09-18T13:00:00+08:00')
    );
    assertSameValue(['user@example.com', 'XCloud音乐反馈回复'], $captured, 'transport received incorrect mail data');
    assertSameValue('2026-09-18T13:00:00+08:00', $result['replied_at'], 'process result timestamp is incorrect');
    $updated = xcloudFeedbackFind($directory, $replyable['id']);
    assertTrueValue($updated !== null, 'feedback disappeared after reply');
    $states = xcloudFeedbackReplyStates($directory);
    assertSameValue('2026-09-18T13:00:00+08:00', $states[$replyable['id']] ?? null, 'successful send must record state');

    echo "PASS: feedback reply\n";
} finally {
    $remove = static function (string $path) use (&$remove): void {
        if (is_dir($path)) { foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $entry) $remove($path . DIRECTORY_SEPARATOR . $entry); rmdir($path); }
        elseif (is_file($path)) unlink($path);
    };
    $remove($directory);
}
