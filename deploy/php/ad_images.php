<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$placement = strtolower(trim((string)($_GET['placement'] ?? '')));
if (!in_array($placement, ['desktop_sidebar', 'mobile_banner'], true)) {
    http_response_code(400);
    echo json_encode(['images' => []]);
    exit;
}

$assetRoot = is_dir(dirname(__DIR__) . '/ad-img') ? dirname(__DIR__) : dirname(__DIR__, 2) . '/public';
$directory = $assetRoot . '/ad-img/' . $placement;
$adsByName = [];
$defaultUrl = 'https://example.com/qr-code.html';
$manifestFile = $assetRoot . '/ad-img/manifest.json';
$manifest = is_file($manifestFile) ? json_decode((string)file_get_contents($manifestFile), true) : [];
foreach (is_array($manifest) && is_array($manifest[$placement] ?? null) ? $manifest[$placement] : [] as $entry) {
    $file = is_array($entry) ? ($entry['image'] ?? null) : $entry;
    if (!is_string($file) || $file === '' || $file[0] === '.' || str_contains($file, '/') || str_contains($file, '\\')) continue;
    if (!preg_match('/\.(?:png|jpe?g|webp|gif|avif)$/i', $file)) continue;
    $url = is_array($entry) && is_string($entry['url'] ?? null) && str_starts_with($entry['url'], 'https://') ? $entry['url'] : $defaultUrl;
    $adsByName[$file] = ['image' => '/ad-img/' . $placement . '/' . rawurlencode($file), 'url' => $url];
}

if ($adsByName === [] && is_dir($directory)) {
    foreach (scandir($directory) ?: [] as $file) {
        if ($file[0] === '.' || !preg_match('/\.(?:png|jpe?g|webp|gif|avif)$/i', $file)) continue;
        $path = $directory . '/' . $file;
        if (!is_file($path) || is_link($path)) continue;
        $adsByName[$file] = ['image' => '/ad-img/' . $placement . '/' . rawurlencode($file), 'url' => $defaultUrl];
    }
}

ksort($adsByName, SORT_NATURAL);
$ads = array_values($adsByName);
echo json_encode(['ads' => $ads, 'images' => array_column($ads, 'image')], JSON_UNESCAPED_SLASHES);
