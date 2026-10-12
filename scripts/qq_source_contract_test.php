<?php
declare(strict_types=1);
/** Example QQ API protocol fixtures; real HTTP compatibility is tested in musicGateway.test.js. */
require_once __DIR__ . '/../deploy/php/music_source_adapters.php';
$songs = xcloudMusicNormalize('meting', 'search', 'qq', [['id'=>'fixture-song-id','name'=>'Fixture song','artist'=>'Fixture artist','pic_id'=>'https://y.gtimg.cn/music/photo_new/T002R300x300M000fixture.jpg']], []);
if ($songs['data'][0]['url_id'] !== 'fixture-song-id' || $songs['data'][0]['source'] !== 'qq') throw new RuntimeException('QQ identity changed');
$audio = xcloudMusicNormalize('meting','url','qq',['url'=>'https://audio.example.test/fixture-hq.m4a','br'=>320,'type'=>'m4a'],[]);
if ($audio['br'] !== 320 || $audio['type'] !== 'm4a') throw new RuntimeException('Quality or container changed');
$lyric = xcloudMusicNormalize('meting','lyric','qq',['lyric'=>'[00:00.00]fixture lyric'],[]);
if ($lyric['lyric'] !== '[00:00.00]fixture lyric') throw new RuntimeException('Lyric changed');
echo "PASS: QQ unified protocol fixtures\n";
