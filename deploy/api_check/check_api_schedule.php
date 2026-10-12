<?php
declare(strict_types=1);
/** Example API health-check task. Uses the same .env providers as the player. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$phpDir = is_file(__DIR__ . '/../php/_features.php') ? __DIR__ . '/../php' : __DIR__ . '/../deploy/php';
require_once $phpDir . '/_features.php';
require_once $phpDir . '/music_source_adapters.php';
$features = xcloudConfiguredFeatures();
$trackIds = ['netease' => '150432', 'kuwo' => '412362550', 'qq' => '003MASv802hpJ7', 'kugou' => 'B3A52A7A958BF0AED0EBFBA2E9A818B7'];
$results = [];
foreach (xcloudMusicPlatforms() as $source => $name) {
    if (!$features['sources'][$source]) continue;
    $row = ['name' => $name, 'search' => 'false', 'play' => 'false', 'last_check' => date('Y-m-d H:i:s')];
    foreach (['search' => 'health', 'play' => 'url'] as $key => $action) {
        try {
            xcloudMusicResolve($action, $source, ['keyword' => 'test', 'page' => 1, 'limit' => 1, 'id' => $trackIds[$source], 'quality' => '320']);
            $row[$key] = 'true';
        } catch (Throwable $error) { /* Do not disclose provider URLs or credentials. */ }
    }
    $results[$source] = $row;
}
$content = "<?php\nheader('Content-Type: application/json; charset=utf-8');\nheader('Cache-Control: no-store');\n?>\n" . json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$target = __DIR__ . '/api_doubtful.php';
$temporary = tempnam(__DIR__, '.health-');
if ($temporary === false) { fwrite(STDERR, "Cannot create health-check cache\n"); exit(1); }
try {
    if (file_put_contents($temporary, $content, LOCK_EX) === false || !rename($temporary, $target)) throw new RuntimeException('Cannot save health-check cache');
} catch (Throwable $error) { if (is_file($temporary)) unlink($temporary); fwrite(STDERR, "Cannot save health-check cache\n"); exit(1); }
echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
