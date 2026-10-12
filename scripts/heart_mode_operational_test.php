<?php
declare(strict_types=1);

$endpoint = file_get_contents(__DIR__ . '/../deploy/php/heart_mode.php');
$rebuild = file_get_contents(__DIR__ . '/../deploy/php/rebuild_heart_mode.php');
$checker = file_get_contents(__DIR__ . '/../deploy/api_check/heart_mode_check.php');
if ($endpoint === false || $rebuild === false || $checker === false) throw new RuntimeException('operational files missing');
foreach (["xcloudRequireFeature('heartMode')", 'PROFILE_STALE', 'CANDIDATE_SHORTAGE', 'DATABASE_UNAVAILABLE', 'heartModeMetric'] as $needle) {
    if (strpos($endpoint, $needle) === false) throw new RuntimeException("endpoint safety contract missing: $needle");
}
foreach (['flock', 'heart_mode_rebuild.lock', 'MAX_EXECUTION_TIME', '--mode=global'] as $needle) {
    if (strpos($rebuild, $needle) === false) throw new RuntimeException("rebuild safety contract missing: $needle");
}
foreach (["xcloudRequireFeature('heartMode')", 'DATABASE_UNAVAILABLE', 'heart_mode_migrations'] as $needle) {
    if (strpos($checker, $needle) === false) throw new RuntimeException("health check contract missing: $needle");
}
echo "heart mode operational contract test passed\n";
