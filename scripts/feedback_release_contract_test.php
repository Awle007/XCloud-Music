<?php
declare(strict_types=1);

function requireFile(string $path): void { if (!is_file($path)) { fwrite(STDERR, "FAIL: missing {$path}\n"); exit(1); } }

$release = __DIR__ . '/../release';
requireFile($release . '/php/feedback.php');
requireFile($release . '/php/feedback_archive.php');
requireFile($release . '/php/send_feedback_digest.php');
requireFile($release . '/.env.production.example');
$digestScript = file_get_contents($release . '/php/send_feedback_digest.php');
if (strpos((string)$digestScript, 'declare(strict_types=1);') === false || strpos((string)$digestScript, "if (PHP_SAPI !== 'cli'") < strpos((string)$digestScript, 'declare(strict_types=1);')) {
    fwrite(STDERR, "FAIL: cron access guard must follow strict-types declaration\n");
    exit(1);
}
$configScript = file_get_contents($release . '/php/config.php');
$environmentScript = file_get_contents($release . '/php/_env.php');
if (!str_contains((string)$configScript, "require_once __DIR__ . '/_env.php'") || substr_count((string)$environmentScript, 'function xcloudEnv(') !== 1) {
    fwrite(STDERR, "FAIL: release config must define xcloudEnv exactly once\n");
    exit(1);
}
if (is_file($release . '/public/sponsor.png') || is_file($release . '/public/sponsor-qr.png')) {
    fwrite(STDERR, "FAIL: sponsor assets must not be released\n");
    exit(1);
}
$env = file_get_contents($release . '/.env.production.example');
if (!str_contains((string)$env, 'FEEDBACK_RECIPIENT_EMAIL=')) {
    fwrite(STDERR, "FAIL: feedback recipient environment key is missing\n");
    exit(1);
}
echo "PASS: feedback release contract\n";
