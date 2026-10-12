<?php
declare(strict_types=1);

require_once __DIR__ . '/../deploy/php/heart_mode_profile.php';

function assertSameValue(mixed $expected, mixed $actual, string $message): void {
    if ($expected !== $actual) {
        throw new RuntimeException($message . "\nexpected: " . var_export($expected, true) . "\nactual: " . var_export($actual, true));
    }
}

assertSameValue(['周杰伦', '方大同', '陶喆'], heartModeSplitArtists('周杰伦, 方大同 & 陶喆'), 'joint artists should be split');
assertSameValue(['G.E.M.邓紫棋', 'Faouzia'], heartModeSplitArtists('G.E.M.邓紫棋,Faouzia'), 'comma in joint artist should be split');
assertSameValue(['The xx'], heartModeSplitArtists(' The xx '), 'single artist should be preserved');

$profile = heartModeBuildProfile([
    ['source' => 'netease', 'song_id' => '1', 'song_artist' => '周杰伦', 'weight' => 3, 'heard' => true],
    ['source' => 'kuwo', 'song_id' => '2', 'song_artist' => '周杰伦', 'weight' => 9, 'heard' => false],
    ['source' => 'kuwo', 'song_id' => '3', 'song_artist' => '周杰伦 & 方大同', 'weight' => 3, 'heard' => false],
]);

assertSameValue(12, $profile['artist_preferences']['kuwo|周杰伦']['weight'], 'source-aware artist weight should aggregate by source');
assertSameValue(3, $profile['artist_preferences']['netease|周杰伦']['weight'], 'same artist on another source must stay separate');
assertSameValue(3, $profile['artist_preferences']['kuwo|方大同']['weight'], 'joint artist must contribute each normalized artist');
assertSameValue(['kuwo', 'netease'], array_keys($profile['artist_sources']['周杰伦']), 'artist source map should retain source dimensions');
$candidate = $profile['candidate_songs'][0];
assertSameValue('netease', $candidate['source'], 'profile should retain candidate source');
assertSameValue('1', $candidate['id'], 'profile should retain candidate id');
if (array_key_exists('weight', $candidate)) throw new RuntimeException('candidate songs must not expose recommendation weights');
$songs = $profile['songs']; sort($songs);
assertSameValue(['kuwo:2', 'kuwo:3', 'netease:1'], $songs, 'songs must retain source and id');

$priorityProfile = heartModeBuildProfile([
    ['source' => 'netease', 'song_id' => 'h1', 'song_title' => '历史歌', 'song_artist' => '周杰伦', 'song_album' => '历史专辑', 'weight' => 20, 'heard' => true, 'origin' => 'history'],
    ['source' => 'kuwo', 'song_id' => 'h2', 'song_title' => '另一首历史歌', 'song_artist' => '周杰伦', 'song_album' => '酷我专辑', 'weight' => 35, 'heard' => true, 'origin' => 'history'],
    ['source' => 'netease', 'song_id' => 'l1', 'song_title' => '库内歌', 'song_artist' => '陈奕迅', 'song_album' => '库内专辑', 'weight' => 1, 'heard' => false, 'origin' => 'library'],
    ['source' => 'netease', 'song_id' => 'l1', 'song_title' => '库内歌', 'song_artist' => '陈奕迅', 'song_album' => '库内专辑', 'weight' => 1, 'heard' => false, 'origin' => 'library'],
]);
assertSameValue('周杰伦', $priorityProfile['priority_artists']['history'][0]['name'], 'history artist ranking should be independent');
assertSameValue(55, $priorityProfile['priority_artists']['history'][0]['weight'], 'history artist score should sum listen counts across sources');
assertSameValue('kuwo', $priorityProfile['priority_artists']['history'][0]['source'], 'artist search source should use the highest source score');
assertSameValue('陈奕迅', $priorityProfile['priority_artists']['library'][0]['name'], 'library artist ranking should be independent');
assertSameValue(2, $priorityProfile['priority_artists']['library'][0]['weight'], 'library duplicate entries should be added');
assertSameValue('另一首历史歌', $priorityProfile['priority_songs']['history'][0]['name'], 'history song ranking should retain song metadata');
assertSameValue('酷我专辑', $priorityProfile['priority_songs']['history'][0]['album'], 'song ranking should retain album metadata');

$candidates = [];
foreach ([['id' => '1', 'artist' => '周杰伦', 'heard' => false], ['id' => '2', 'artist' => '周杰伦', 'heard' => false], ['id' => '3', 'artist' => '周杰伦', 'heard' => false], ['id' => '4', 'artist' => '陈奕迅', 'heard' => false], ['id' => '5', 'artist' => '林俊杰', 'heard' => false], ['id' => '6', 'artist' => '王菲', 'heard' => false], ['id' => '7', 'artist' => '陶喆', 'heard' => true], ['id' => '8', 'artist' => '方大同', 'heard' => true]] as $index => $item) {
    $candidates[] = $item + ['key' => 'kuwo:' . $item['id'], 'score' => 100 - $index, 'row' => $item, 'preference' => 10];
}
$selected = heartModeSelectCandidates($candidates, 10);
assertSameValue(8, count($selected), 'selector should return every available candidate without dropping songs');
assertSameValue(3, count(array_filter($selected, static fn(array $item): bool => $item['artist'] === '周杰伦')), 'high-affinity artist should be capped when alternatives exist');
assertSameValue('https://img1.kuwo.cn/star/albumcover/120/1/2.jpg', heartModeNormalizeCover('kuwo', '120/1/2.jpg', '1'), 'kuwo relative cover should be normalized');
assertSameValue('', heartModeNormalizeCover('kuwo', '', '1'), 'missing cover should be resolved by the source-aware client');
$merged = heartModeMergeProfileCandidates($profile, [['id' => '99', 'source' => 'kuwo', 'name' => '搜索结果', 'artist' => '周杰伦', 'album' => '专辑', 'pic_id' => 'https://img.example/kuwo.jpg']]);
assertSameValue('https://img.example/kuwo.jpg', $merged['candidate_songs'][count($merged['candidate_songs']) - 1]['pic_id'], 'source search metadata should retain cover');

$beforeNoCover = count($merged['candidate_songs']);
$merged = heartModeMergeProfileCandidates($merged, [['id' => '100', 'source' => 'kuwo', 'name' => 'No cover', 'artist' => 'Test artist', 'pic_id' => '']]);
assertSameValue($beforeNoCover, count($merged['candidate_songs']), 'search results without covers should be skipped');
$duplicateProfile = heartModeBuildProfile([
    ['source' => 'netease', 'song_id' => 'song-a', 'song_title' => 'Same Song', 'song_artist' => 'Same Artist', 'song_cover' => 'cover-a', 'weight' => 1],
    ['source' => 'netease', 'song_id' => 'song-b', 'song_title' => 'Same Song', 'song_artist' => 'Same Artist', 'song_cover' => 'cover-b', 'weight' => 1],
]);
assertSameValue(1, count($duplicateProfile['candidate_songs']), 'same title and artist should be deduplicated');
assertSameValue('cover-a', $duplicateProfile['candidate_songs'][0]['pic_id'], 'song id and cover id must stay separate');

$priorityCandidates = [
    ['key' => 'kuwo:library', 'artist' => 'Library', 'heard' => false, 'origin' => 'library', 'score' => 100],
    ['key' => 'kuwo:search', 'artist' => 'Search', 'heard' => false, 'origin' => 'source_search', 'score' => 1],
    ['key' => 'netease:history', 'artist' => 'History', 'heard' => true, 'origin' => 'history', 'score' => 50],
];
$priority = heartModeSelectCandidates($priorityCandidates, 3);
assertSameValue(['source_search', 'history', 'library'], array_column($priority, 'origin'), 'source search and site history should outrank imported unplayed library songs');

echo "heart mode profile test passed\n";
