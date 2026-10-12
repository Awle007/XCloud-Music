<?php
declare(strict_types=1);
require_once __DIR__ . '/../deploy/php/music_source_adapters.php';
// 纯 fixture 协议示例调用：两种 JSON 协议均保留有效 UTF-8 歌词。
$lyric = "[00:01.20]梦的翅膀受了伤\n[00:04.00]中文与 café 🎵";
foreach (['local' => ['gc' => $lyric], 'meting' => ['lyric' => $lyric, 'tlyric' => 'translation']] as $format => $payload) {
    $result = xcloudMusicNormalize($format, 'lyric', 'kuwo', $payload, []);
    if ($result['lyric'] !== $lyric) throw new RuntimeException('Valid UTF-8 Kuwo lyrics were changed');
}
$rejected = false;
try { xcloudMusicNormalize('meting', 'lyric', 'kuwo', ['lyric' => ['invalid']], []); }
catch (RuntimeException $error) { $rejected = true; }
if (!$rejected) throw new RuntimeException('Malformed lyrics must be rejected');
echo "kuwo lyric encoding contract test passed\n";
