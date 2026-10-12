<?php
declare(strict_types=1);

function xcloudFeedbackDigestBody(array $records): string
{
    $lines = ['XCloud音乐今日反馈内容如下：'];
    foreach ($records as $index => $record) {
        $lines[] = ($index + 1) . '. ' . trim((string)$record['message']) . '。  联系邮箱：' . (trim((string)$record['email']) ?: '无');
    }
    return implode("\n", $lines);
}

function xcloudFeedbackDigestHtml(array $records, string $date): string
{
    $items = '';
    foreach ($records as $index => $record) {
        $message = nl2br(htmlspecialchars(trim((string)$record['message']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $email = trim((string)$record['email']);
        $email = $email === '' ? '未提供' : htmlspecialchars($email, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $items .= '<section style="margin:0 0 14px;padding:16px 18px;border:1px solid #e7edf0;border-radius:12px;background:#ffffff">'
            . '<div style="margin:0 0 10px;color:#49a958;font-size:14px;font-weight:700">反馈 ' . ($index + 1) . '</div>'
            . '<div style="color:#20282c;font-size:15px;line-height:1.75;word-break:break-word">' . $message . '</div>'
            . '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eef2f3;color:#708087;font-size:13px">联系邮箱：<span style="color:#3f4d52">' . $email . '</span></div>'
            . '</section>';
    }
    $safeDate = htmlspecialchars($date, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return '<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f4f7f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,sans-serif">'
        . '<main style="max-width:680px;margin:0 auto;padding:28px;background:#ffffff;border-radius:16px">'
        . '<h1 style="margin:0;color:#1f292d;font-size:22px">XCloud音乐反馈日报</h1>'
        . '<p style="margin:8px 0 24px;color:#829096;font-size:14px">' . $safeDate . ' · 共 ' . count($records) . ' 条反馈</p>'
        . $items
        . '<p style="margin:22px 0 0;color:#98a4a8;font-size:12px;text-align:center">此邮件由 XCloud音乐自动发送</p>'
        . '</main></body></html>';
}

function xcloudFeedbackReceiptPath(string $archivePath): string { return preg_replace('/\.ndjson$/', '.sent.json', $archivePath) ?: $archivePath . '.sent.json'; }

function xcloudFeedbackPendingArchives(string $directory, ?DateTimeImmutable $now = null): array
{
    $today = ($now ?? new DateTimeImmutable('now', new DateTimeZone('Asia/Shanghai')))
        ->setTimezone(new DateTimeZone('Asia/Shanghai'))
        ->format('Y-m-d');
    $archives = glob($directory . DIRECTORY_SEPARATOR . '*.ndjson') ?: [];
    $pending = array_filter($archives, static function (string $archive) use ($today): bool {
        $date = basename($archive, '.ndjson');
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1
            && $date < $today
            && !is_file(xcloudFeedbackReceiptPath($archive));
    });
    sort($pending, SORT_STRING);
    return array_values($pending);
}

function xcloudFeedbackWriteReceipt(string $archivePath): void
{
    $receipt = xcloudFeedbackReceiptPath($archivePath);
    $temporary = $receipt . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $payload = ['sent_at' => (new DateTimeImmutable('now', new DateTimeZone('Asia/Shanghai')))->format(DATE_ATOM), 'sha256' => hash_file('sha256', $archivePath)];
    if (file_put_contents($temporary, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), LOCK_EX) === false || !rename($temporary, $receipt)) {
        @unlink($temporary);
        throw new RuntimeException('Unable to save feedback receipt');
    }
    @chmod($receipt, 0640);
}

function xcloudSendFeedbackDigest(string $archivePath): bool
{
    require_once __DIR__ . '/_features.php';
    xcloudRequireFeature('feedback');
    $records = xcloudFeedbackRecords($archivePath);
    if (!$records) return false;
    require_once __DIR__ . '/vendor/autoload.php';
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = xcloudEnv('SMTP_HOST');
    $mail->SMTPAuth = true;
    $mail->Username = xcloudEnv('SMTP_USERNAME');
    $mail->Password = xcloudEnv('SMTP_PASSWORD');
    $mail->SMTPSecure = 'ssl';
    $mail->Port = (int)xcloudEnv('SMTP_PORT', '465');
    $mail->setFrom(xcloudEnv('SMTP_FROM_ADDRESS', xcloudEnv('SMTP_USERNAME')), xcloudEnv('SMTP_FROM_NAME', 'XCloud音乐'));
    $mail->addAddress(xcloudEnv('FEEDBACK_RECIPIENT_EMAIL'));
    $mail->CharSet = 'UTF-8';
    $mail->isHTML(true);
    $mail->Subject = 'XCloud音乐反馈日报 ' . basename($archivePath, '.ndjson');
    $mail->Body = xcloudFeedbackDigestHtml($records, basename($archivePath, '.ndjson'));
    $mail->AltBody = xcloudFeedbackDigestBody($records);
    $mail->send();
    xcloudFeedbackWriteReceipt($archivePath);
    return true;
}

if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
if (PHP_SAPI === 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    require_once __DIR__ . '/_features.php';
    xcloudRequireFeature('feedback');
    require_once __DIR__ . '/config.php';
    require_once __DIR__ . '/feedback_archive.php';
    date_default_timezone_set('Asia/Shanghai');
    $directory = xcloudFeedbackArchiveDirectory();
    foreach (xcloudFeedbackPendingArchives($directory) as $archive) {
        try { xcloudSendFeedbackDigest($archive); } catch (Throwable $error) { fwrite(STDERR, 'Feedback digest failed: ' . $error->getMessage() . PHP_EOL); exit(1); }
    }
}
