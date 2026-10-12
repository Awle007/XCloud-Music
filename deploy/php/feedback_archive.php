<?php
declare(strict_types=1);

function xcloudFeedbackArchiveDirectory(): string
{
    $directory = xcloudEnv('FEEDBACK_ARCHIVE_DIR', dirname(__DIR__) . '/cache/feedback');
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Feedback archive is unavailable');
    }
    $resolved = realpath($directory);
    if ($resolved === false) throw new RuntimeException('Feedback archive is unavailable');
    @chmod($resolved, 0750);
    return $resolved;
}

function xcloudFeedbackAppend(string $message, string $email, ?DateTimeImmutable $now = null): string
{
    $message = trim($message);
    $email = trim($email);
    if ($message === '' || mb_strlen($message, 'UTF-8') > 2000) throw new InvalidArgumentException('反馈内容不正确');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('邮箱格式不正确');
    $zone = new DateTimeZone('Asia/Shanghai');
    $now = $now?->setTimezone($zone) ?? new DateTimeImmutable('now', $zone);
    $path = xcloudFeedbackArchiveDirectory() . DIRECTORY_SEPARATOR . $now->format('Y-m-d') . '.ndjson';
    $handle = fopen($path, 'ab');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        throw new RuntimeException('Feedback archive is unavailable');
    }
    try {
        $record = ['submitted_at' => $now->format(DATE_ATOM), 'message' => $message, 'email' => $email];
        if (fwrite($handle, json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL) === false || !fflush($handle)) {
            throw new RuntimeException('Feedback archive is unavailable');
        }
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    @chmod($path, 0640);
    return $path;
}

function xcloudFeedbackRecords(string $path): array
{
    $records = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $record = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
        if (is_array($record) && isset($record['message'], $record['email'])) $records[] = $record;
    }
    return $records;
}
