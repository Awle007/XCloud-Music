<?php
declare(strict_types=1);
require_once __DIR__ . '/../deploy/php/music_source_adapters.php';
// 纯 fixture 协议示例调用：保留网易数字封面标识和原始平台歌曲身份。
$cover = '109951170045577565';
$song = ['id' => '2600493765', 'name' => '李荣浩测试歌曲', 'artist' => ['李荣浩'], 'album' => '专辑', 'pic_id' => $cover];
$meting = xcloudMusicNormalize('meting', 'search', 'netease', [$song], []);
$local = xcloudMusicNormalize('local', 'search', 'netease', ['code' => 0, 'data' => ['songs' => [['rid' => $song['id'], 'name' => $song['name'], 'artist' => $song['artist'], 'album' => $song['album'], 'pic' => $cover]]]], []);
foreach ([$meting, $local] as $result) {
    if (($result['data'][0]['pic_id'] ?? '') !== $cover) throw new RuntimeException('numeric NetEase album cover ID was not retained');
    if (($result['data'][0]['id'] ?? '') !== $song['id'] || ($result['data'][0]['source'] ?? '') !== 'netease') throw new RuntimeException('NetEase song identity was changed');
}
echo "NetEase numeric cover ID contract passed\n";
