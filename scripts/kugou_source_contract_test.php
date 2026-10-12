<?php
declare(strict_types=1);
/** Example Kugou API protocol fixtures; no live service requests. */
require_once __DIR__ . '/../deploy/php/music_source_adapters.php';
$hash='B3A52A7A958BF0AED0EBFBA2E9A818B7';
$songs=xcloudMusicNormalize('local','search','kugou',['code'=>0,'data'=>['songs'=>[['rid'=>$hash,'name'=>'Fixture song','pic'=>'https://example.com/cover.jpg']]]],[]);
if ($songs['data'][0]['url_id'] !== $hash || $songs['data'][0]['source'] !== 'kugou') throw new RuntimeException('Hash identity changed');
$audio=xcloudMusicNormalize('local','url','kugou',['data'=>[['url'=>'http://audio.example.test/song.flac','type'=>'flac','ts'=>'SQ']],'gc'=>'fixture lyric'],['quality'=>'kg_5']);
if (!str_starts_with($audio['url'],'http://') || $audio['type'] !== 'flac' || $audio['lyric'] !== 'fixture lyric') throw new RuntimeException('Kugou media metadata changed');
echo "PASS: Kugou unified protocol fixtures\n";
