<?php
declare(strict_types=1);

$endpoint = file_get_contents(__DIR__ . '/../deploy/php/heart_mode.php');
$rebuild = file_get_contents(__DIR__ . '/../deploy/php/rebuild_heart_mode.php');
 $profile = file_get_contents(__DIR__ . '/../deploy/php/heart_mode_profile.php');
$neteaseSearch = file_get_contents(__DIR__ . '/../deploy/php/netease_search.php');
$neteaseSource = file_get_contents(__DIR__ . '/../deploy/php/netease_source.php');
$neteasePayload = file_get_contents(__DIR__ . '/../deploy/php/netease_payload.php');
if ($endpoint === false || $rebuild === false || $profile === false || $neteaseSearch === false || $neteaseSource === false || $neteasePayload === false) throw new RuntimeException('heart mode PHP files missing');
foreach (['recommend', 'sync_signals', 'status', 'xcloudPhase3RequireUserToken', 'prepare(', 'fallback_recommendation', 'heartModeSearchContext', 'profile_candidates', 'priority_artists', 'priority_songs', 'heartModeBuildProfile', 'next_build_at', 'INTERVAL 1 DAY'] as $needle) {
    if (strpos($endpoint, $needle) === false) throw new RuntimeException("endpoint contract missing: $needle");
}
foreach (['global', 'users', 'user', 'heart_mode_user_profiles', 'heart_mode_song_stats', 'migration already exists'] as $needle) {
    if (strpos($rebuild, $needle) === false) throw new RuntimeException("rebuild contract missing: $needle");
}
if (strpos($rebuild, 'heartModeSearchSource(') !== false || strpos($rebuild, 'heartModeEnrichProfileCandidates(') !== false) {
    throw new RuntimeException('profile rebuild must not request upstream search sources');
}
foreach (['heartModeSplitArtists', 'artist_preferences', 'artist_sources', 'candidate_songs', 'heartModeProfilePreferenceWeight', 'heartModeSelectCandidates', 'heartModeNormalizeCover', 'heartModeMergeProfileCandidates'] as $needle) {
    if (strpos($profile, $needle) === false) throw new RuntimeException("profile contract missing: $needle");
}
// Compatibility entries delegate platform identity and legacy list shape to the unified gateway.
foreach ([$neteaseSearch, $neteaseSource] as $compatibilityEntry) {
    foreach (["define('XCLOUD_COMPAT_SOURCE', 'netease')", "'/music_source.php'"] as $needle) {
        if (!str_contains($compatibilityEntry, $needle)) throw new RuntimeException("NetEase compatibility contract missing: $needle");
    }
}
if (!str_contains($neteaseSearch, "define('XCLOUD_COMPAT_LIST', true)") || !str_contains($neteaseSource, "define('XCLOUD_COMPAT_LIST', false)")) throw new RuntimeException('NetEase heart search legacy list contract changed');
foreach (['xcloudNeteaseDecodePayload', 'xcloudNeteaseEscapeBareStringQuotes', 'JSON_INVALID_UTF8_SUBSTITUTE'] as $needle) {
    if (strpos($neteasePayload, $needle) === false) throw new RuntimeException("netease payload decode contract missing: $needle");
}
echo "heart mode PHP contract test passed\n";
