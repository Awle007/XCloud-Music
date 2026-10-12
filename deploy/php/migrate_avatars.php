<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/cos.php';

$conn = getDBConnection();
$root = dirname(__DIR__, 2);
$stmt = $conn->query("SELECT id, avatar FROM users WHERE avatar IS NOT NULL AND avatar <> '' AND avatar NOT LIKE 'http://%' AND avatar NOT LIKE 'https://%'");
$migrated = 0;
$skipped = 0;
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $user) {
    $avatar = ltrim((string)$user['avatar'], '/');
    $objectKey = $avatar;
    if (!preg_match('#^(?:upload|public)/avatars/[A-Za-z0-9._/-]+\.(?:jpg|jpeg|png)$#i', $objectKey)) { $skipped++; continue; }
    $local = $root . '/' . $avatar;
    if (!is_file($local)) { $skipped++; continue; }
    $extension = strtolower(pathinfo($avatar, PATHINFO_EXTENSION));
    xcloudCosUpload($local, $objectKey, 'image/' . ($extension === 'png' ? 'png' : 'jpeg'));
    $migrated++;
    echo "Migrated user {$user['id']}: {$avatar}\n";
}
echo "Migration complete: {$migrated} migrated, {$skipped} skipped.\n";
