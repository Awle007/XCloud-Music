<?php
declare(strict_types=1);

function xcloudFeedbackId(string $archiveName, int $lineNumber, string $rawLine): string
{
    return hash('sha256', $archiveName . "\0" . $lineNumber . "\0" . $rawLine);
}

function xcloudFeedbackReplyStatePath(string $directory): string
{
    return $directory . DIRECTORY_SEPARATOR . 'state' . DIRECTORY_SEPARATOR . 'replies.ndjson';
}

function xcloudFeedbackReplyStates(string $directory): array
{
    $states = [];
    $path = xcloudFeedbackReplyStatePath($directory);
    if (!is_file($path)) return $states;

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $event = json_decode($line, true);
        if (!is_array($event) || !isset($event['feedback_id'], $event['replied_at'])) continue;
        $id = (string)$event['feedback_id'];
        $repliedAt = (string)$event['replied_at'];
        if (!preg_match('/^[a-f0-9]{64}$/', $id)) continue;
        try {
            new DateTimeImmutable($repliedAt);
        } catch (Throwable) {
            continue;
        }
        if (!isset($states[$id]) || strcmp($repliedAt, $states[$id]) > 0) $states[$id] = $repliedAt;
    }
    return $states;
}

function xcloudFeedbackAllRecords(string $directory): array
{
    $archives = glob($directory . DIRECTORY_SEPARATOR . '*.ndjson') ?: [];
    $archives = array_values(array_filter($archives, static fn(string $path): bool => preg_match('/^\d{4}-\d{2}-\d{2}\.ndjson$/', basename($path)) === 1));
    rsort($archives, SORT_STRING);

    $items = [];
    $invalidCount = 0;
    foreach ($archives as $archive) {
        $archiveName = basename($archive);
        $handle = fopen($archive, 'rb');
        if ($handle === false) continue;
        try {
            $lineNumber = 0;
            while (($raw = fgets($handle)) !== false) {
                $lineNumber++;
                $raw = rtrim($raw, "\r\n");
                if ($raw === '') continue;
                $record = json_decode($raw, true);
                if (!is_array($record) || !isset($record['submitted_at'], $record['message'], $record['email'])) {
                    $invalidCount++;
                    continue;
                }
                $submittedAt = (string)$record['submitted_at'];
                $message = trim((string)$record['message']);
                $email = trim((string)$record['email']);
                try {
                    $timestamp = (new DateTimeImmutable($submittedAt))->getTimestamp();
                } catch (Throwable) {
                    $invalidCount++;
                    continue;
                }
                if ($message === '' || ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL))) {
                    $invalidCount++;
                    continue;
                }
                $items[] = [
                    'id' => xcloudFeedbackId($archiveName, $lineNumber, $raw),
                    'submitted_at' => $submittedAt,
                    'message' => $message,
                    'email' => $email,
                    '_timestamp' => $timestamp,
                ];
            }
        } finally {
            fclose($handle);
        }
    }

    usort($items, static function (array $left, array $right): int {
        $timeOrder = $right['_timestamp'] <=> $left['_timestamp'];
        return $timeOrder !== 0 ? $timeOrder : strcmp($right['id'], $left['id']);
    });
    return ['items' => $items, 'invalid_count' => $invalidCount];
}

function xcloudFeedbackPage(string $directory, int $page, int $perPage = 20): array
{
    if ($page < 1 || $perPage < 1 || $perPage > 100) throw new InvalidArgumentException('Invalid pagination');
    $loaded = xcloudFeedbackAllRecords($directory);
    $states = xcloudFeedbackReplyStates($directory);
    $total = count($loaded['items']);
    $totalPages = max(1, (int)ceil($total / $perPage));
    $page = min($page, $totalPages);
    $items = array_slice($loaded['items'], ($page - 1) * $perPage, $perPage);
    foreach ($items as &$item) {
        unset($item['_timestamp']);
        $item['replied'] = isset($states[$item['id']]);
        $item['replied_at'] = $states[$item['id']] ?? null;
    }
    unset($item);

    return [
        'items' => $items,
        'page' => $page,
        'per_page' => $perPage,
        'total' => $total,
        'total_pages' => $totalPages,
        'invalid_count' => $loaded['invalid_count'],
    ];
}

function xcloudFeedbackFind(string $directory, string $feedbackId): ?array
{
    if (!preg_match('/^[a-f0-9]{64}$/', $feedbackId)) return null;
    $loaded = xcloudFeedbackAllRecords($directory);
    foreach ($loaded['items'] as $item) {
        if (hash_equals($item['id'], $feedbackId)) {
            unset($item['_timestamp']);
            return $item;
        }
    }
    return null;
}

function xcloudFeedbackRecordReply(string $directory, string $feedbackId, ?DateTimeImmutable $now = null): string
{
    if (!preg_match('/^[a-f0-9]{64}$/', $feedbackId)) throw new InvalidArgumentException('Invalid feedback ID');
    $stateDirectory = $directory . DIRECTORY_SEPARATOR . 'state';
    if (!is_dir($stateDirectory) && !mkdir($stateDirectory, 0750, true) && !is_dir($stateDirectory)) {
        throw new RuntimeException('Feedback reply state is unavailable');
    }
    @chmod($stateDirectory, 0750);
    $path = xcloudFeedbackReplyStatePath($directory);
    $handle = fopen($path, 'ab');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        throw new RuntimeException('Feedback reply state is unavailable');
    }
    $zone = new DateTimeZone('Asia/Shanghai');
    $repliedAt = ($now ?? new DateTimeImmutable('now', $zone))->setTimezone($zone)->format(DATE_ATOM);
    try {
        $line = json_encode(['feedback_id' => $feedbackId, 'replied_at' => $repliedAt], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
        if (fwrite($handle, $line) === false || !fflush($handle)) throw new RuntimeException('Feedback reply state is unavailable');
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    @chmod($path, 0640);
    return $repliedAt;
}
