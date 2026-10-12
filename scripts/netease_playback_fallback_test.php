<?php
declare(strict_types=1);
require_once __DIR__ . '/../deploy/php/music_source_adapters.php';
// 纯 fixture 协议示例调用：备用服务与主服务共用统一适配器，不连接真实上游。
$result = xcloudMusicNormalize('meting', 'url', 'netease', ['url' => 'https://audio.example.test/backup.m4a', 'type' => 'm4a', 'br' => 320], ['id' => '347230', 'quality' => '320']);
if ($result['url'] !== 'https://audio.example.test/backup.m4a' || $result['type'] !== 'm4a' || $result['source'] !== 'netease' || $result['br'] !== 320) throw new RuntimeException('Backup normalization lost playback metadata');
foreach ([['message' => 'no playable url'], ['url' => 'javascript:invalid'], ['url' => 'file:///private.mp3']] as $invalid) {
    $rejected = false;
    try { xcloudMusicNormalize('meting', 'url', 'netease', $invalid, ['quality' => '320']); }
    catch (RuntimeException $error) { $rejected = true; }
    if (!$rejected) throw new RuntimeException('Backup response without an HTTP playback URL was accepted');
}
echo "PASS: NetEase unified playback backup normalization contract\n";
