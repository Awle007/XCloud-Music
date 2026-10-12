<?php
declare(strict_types=1);

$root = sys_get_temp_dir() . '/xcloud-local-avatar-' . bin2hex(random_bytes(8));
mkdir($root . '/php', 0700, true);
copy(__DIR__ . '/../deploy/php/cos.php', $root . '/php/cos.php');
function xcloudEnv(string $name, ?string $default = null): string { return $default ?? ''; }
require $root . '/php/cos.php';
$input = $root . '/sample.png';
file_put_contents($input, 'fixture-image-bytes');
$key = 'upload/avatars/avatar_7_fixture.png';
try {
    xcloudCosUpload($input, $key, 'image/png');
    if (file_get_contents($root . '/' . $key) !== 'fixture-image-bytes') throw new RuntimeException('Local upload did not preserve bytes');
    if (xcloudAvatarCdnUrl('public/avatars/default1.png') !== '/avatars/default1.png') throw new RuntimeException('Default avatar must use a local URL');
    if (xcloudAvatarCdnUrl($key) !== '/' . $key) throw new RuntimeException('Uploaded avatar must use a local URL');
    try {
        xcloudCosUpload($input, 'upload/avatars/../../escape.png', 'image/png');
        throw new LogicException('Traversal was accepted');
    } catch (RuntimeException $error) {
        if ($error instanceof LogicException) throw $error;
    }
    xcloudCosDelete($key);
    if (file_exists($root . '/' . $key)) throw new RuntimeException('Local delete failed');
    echo "PASS: local avatar storage and safe paths\n";
} finally {
    foreach ([$root . '/' . $key, $input, $root . '/php/cos.php'] as $file) if (is_file($file)) unlink($file);
    foreach ([$root . '/upload/avatars', $root . '/upload', $root . '/php', $root] as $directory) if (is_dir($directory)) rmdir($directory);
}
