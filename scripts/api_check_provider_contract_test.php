<?php
declare(strict_types=1);
/** Example scheduled health-check contract; no live service requests. */
$root = file_get_contents(__DIR__ . '/../api_check/check_api_schedule.php');
$deploy = file_get_contents(__DIR__ . '/../deploy/api_check/check_api_schedule.php');
if ($root !== $deploy) throw new RuntimeException('Source/deploy health tasks diverged');
foreach (["PHP_SAPI !== 'cli'", 'xcloudConfiguredFeatures()', "['sources']", 'xcloudMusicResolve(', 'api_doubtful.php'] as $needle) {
    if (!str_contains($root, $needle)) throw new RuntimeException('Missing shared health-check contract: ' . $needle);
}
if (str_contains($root, 'https://api.example.com')) throw new RuntimeException('Health task must not configure another upstream');
echo "PASS: Shared provider health task contract\n";
