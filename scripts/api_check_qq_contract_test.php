<?php
declare(strict_types=1);
/** Example API health-query contract; fixtures only, no live requests. */
require_once __DIR__ . '/../deploy/php/music_source_adapters.php';
$local = xcloudMusicQuery('local', 'health', 'qq', ['keyword' => 'test', 'page' => 1, 'limit' => 1]);
$meting = xcloudMusicQuery('meting', 'health', 'qq', ['keyword' => 'test', 'page' => 1, 'limit' => 1]);
if ($local['api'] !== 'search_with_source' || $meting['types'] !== 'search' || $meting['source'] !== 'qq') throw new RuntimeException('Health query protocol mismatch');
echo "PASS: Unified QQ health query contract\n";
