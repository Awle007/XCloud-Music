<?php
declare(strict_types=1);

// Development only: expose the same paths as the production package.
$project = dirname(__DIR__);
$uri = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if (str_contains($uri, "\0") || preg_match('#(?:^|/)\.#', $uri)
    || preg_match('#^/(?:cache/(?:feedback|rate_limits)|admin/(?:includes|setup\.php|check_db\.php))(?:/|$)#', $uri)) {
    http_response_code(404); exit;
}
$mappings = [
    '/php/' => $project . '/deploy/php/',
    '/admin/' => $project . '/admin/',
    '/api_check/' => $project . '/api_check/',
    '/cache/' => $project . '/deploy/cache/',
    '/upload/' => $project . '/deploy/upload/',
    '/' => $project . '/public/',
];
if ($uri === '/admin' || $uri === '/api_check') { header('Location: ' . $uri . '/', true, 302); exit; }
foreach ($mappings as $prefix => $directory) {
    if (!str_starts_with($uri, $prefix)) continue;
    $candidate = $directory . substr($uri, strlen($prefix));
    if (is_dir($candidate)) $candidate .= '/index.php';
    $file = realpath($candidate);
    $base = realpath($directory);
    if ($file === false || $base === false || !is_file($file)
        || !str_starts_with(str_replace('\\', '/', $file), rtrim(str_replace('\\', '/', $base), '/') . '/')) break;
    if (pathinfo($file, PATHINFO_EXTENSION) === 'php') {
        if (preg_match('#^/(?:upload|ad-img)/#', $uri)) break;
        $_SERVER['SCRIPT_FILENAME'] = $file;
        chdir(dirname($file));
        require $file;
    } else {
        $types = ['css' => 'text/css', 'js' => 'application/javascript', 'json' => 'application/json', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'ico' => 'image/x-icon', 'woff' => 'font/woff', 'woff2' => 'font/woff2'];
        header('Content-Type: ' . ($types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
        readfile($file);
    }
    exit;
}
http_response_code(404);
