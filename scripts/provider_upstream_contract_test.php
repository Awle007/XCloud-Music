<?php
declare(strict_types=1);
require_once __DIR__ . '/../deploy/php/music_source_adapters.php';
// 纯 fixture 协议示例调用：只构造参数，不请求真实音乐服务。
foreach (['netease_source' => 'netease', 'netease_search' => 'netease', 'kuwo_backup_source' => 'kuwo', 'qq_source' => 'qq', 'kugou_source' => 'kugou'] as $entry => $platform) {
    $code = file_get_contents(__DIR__ . '/../deploy/php/' . $entry . '.php');
    if (!is_string($code) || !str_contains($code, "define('XCLOUD_COMPAT_SOURCE', '" . $platform . "')") || !str_contains($code, "'/music_source.php'")) throw new RuntimeException('Compatibility entry must route through the unified gateway: ' . $entry);
}
foreach (xcloudMusicPlatforms() as $platform => $label) {
    $local = xcloudMusicQuery('local', 'search', $platform, ['keyword' => '中文测试', 'page' => 2, 'limit' => 12]);
    if ($local !== ['source' => $label, 'api' => 'search_with_source', 'key' => '中文测试', 'pn' => 2]) throw new RuntimeException('local search contract changed');
    $url = xcloudMusicQuery('local', 'url', $platform, ['id' => 'source-specific-id']);
    if ($url !== ['source' => $label, 'api' => 'get_song_with_source', 'id' => 'source-specific-id']) throw new RuntimeException('local song identity changed');
    $lyric = xcloudMusicQuery('local', 'lyric', $platform, ['id' => 'source-specific-id']);
    if ($lyric['api'] !== 'get_lyrics_with_source' || $lyric['id'] !== 'source-specific-id') throw new RuntimeException('local lyric contract changed');
    $meting = xcloudMusicQuery('meting', 'search', $platform, ['keyword' => '中文测试', 'page' => 2, 'limit' => 12]);
    if ($meting['source'] !== $platform || $meting['types'] !== 'search' || $meting['name'] !== '中文测试' || $meting['pages'] !== 2 || $meting['count'] !== 12) throw new RuntimeException('meting search contract changed');
    $play = xcloudMusicQuery('meting', 'url', $platform, ['id' => 'source-specific-id', 'quality' => '320']);
    if ($play['id'] !== 'source-specific-id' || $play['br'] !== 320) throw new RuntimeException('meting playback identity or quality changed');
}
echo "provider unified protocol contract test passed\n";
