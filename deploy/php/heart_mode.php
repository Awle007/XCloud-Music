<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
require_once __DIR__ . '/heart_mode_profile.php';

function heartModeEnabled(): bool {
    return xcloudFeatures()['heartMode'];
}

function heartModeMetric(PDO $db, string $name, int $amount = 1): void {
    try {
        $stmt = $db->prepare('INSERT INTO heart_mode_metrics (metric_date, metric_name, metric_value) VALUES (CURDATE(), ?, ?) ON DUPLICATE KEY UPDATE metric_value = metric_value + VALUES(metric_value)');
        $stmt->execute([$name, max(1, $amount)]);
    } catch (Throwable $error) {
        error_log('heart mode metric failed: ' . $error->getMessage());
    }
}

function heartModeRespond(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function heartModeInput(): array {
    $input = xcloudPhase3Input();
    if (isset($input['exclude_keys']) && is_string($input['exclude_keys'])) $input['exclude_keys'] = json_decode($input['exclude_keys'], true);
    if (isset($input['signals']) && is_string($input['signals'])) $input['signals'] = json_decode($input['signals'], true);
    return is_array($input) ? $input : [];
}

function heartModeUserId(array $input): int {
    $id = (int)($input['user_id'] ?? 0);
    if ($id <= 0) heartModeRespond(['success' => false, 'error_code' => 'AUTH_REQUIRED', 'message' => '请先登录'], 401);
    return $id;
}

function heartModeNormalizeKey(string $source, string $id): string { return strtolower(trim($source)) . ':' . trim($id); }

/** 仅过滤本次响应的派生画像，不删除数据库中的原始偏好和歌曲。 */
function heartModeEnabledProfile(array $profileData): array {
    $sources = xcloudFeatures()['sources'];
    $filter = static function (array $rows) use ($sources): array {
        $result = [];
        foreach ($rows as $key => $row) {
            if (!is_array($row)) continue;
            if (is_array($row['source_weights'] ?? null)) {
                $row['source_weights'] = array_filter($row['source_weights'], static fn($source) => $sources[$source] ?? false, ARRAY_FILTER_USE_KEY);
                if (!$row['source_weights']) continue;
                arsort($row['source_weights']);
                $row['source'] = (string)array_key_first($row['source_weights']);
            }
            if (!($sources[strtolower((string)($row['source'] ?? ''))] ?? false)) continue;
            $result[$key] = $row;
        }
        return array_is_list($rows) ? array_values($result) : $result;
    };
    foreach (['candidate_songs', 'artist_preferences'] as $key) {
        if (is_array($profileData[$key] ?? null)) $profileData[$key] = $filter($profileData[$key]);
    }
    foreach (['priority_songs', 'priority_artists'] as $key) {
        foreach (['history', 'library'] as $bucket) {
            if (is_array($profileData[$key][$bucket] ?? null)) $profileData[$key][$bucket] = $filter($profileData[$key][$bucket]);
        }
    }
    return $profileData;
}

function heartModeSearchContext(array $profileData): array {
    $context = [];
    foreach (($profileData['artist_preferences'] ?? []) as $preference) {
        if (!is_array($preference)) continue;
        $source = strtolower(trim((string)($preference['source'] ?? '')));
        $artist = trim((string)($preference['name'] ?? ''));
        if (!in_array($source, ['netease', 'kuwo', 'qq'], true) || $artist === '') continue;
        $context[] = ['source' => $source, 'artist' => $artist, 'weight' => (int)($preference['weight'] ?? 0)];
        if (count($context) >= 8) break;
    }
    return $context;
}

function heartModeProfileCandidateMetadata(array $profileData): array {
    $metadata = [];
    foreach (($profileData['candidate_songs'] ?? []) as $candidate) {
        if (!is_array($candidate)) continue;
        $source = strtolower(trim((string)($candidate['source'] ?? '')));
        $id = trim((string)($candidate['id'] ?? ''));
        if ($source === '' || $id === '') continue;
        $metadata[] = [
            'id' => $id,
            'source' => $source,
            'name' => (string)($candidate['name'] ?? ''),
            'artist' => (string)($candidate['artist'] ?? ''),
            'heard' => !empty($candidate['heard']),
            'origin' => (string)($candidate['origin'] ?? 'library'),
        ];
    }
    return $metadata;
}

function heartModeBuildUserProfile(PDO $db, int $userId): array {
    $rows = [];
    $queries = [
        ['sql' => 'SELECT source, song_id, song_title, song_artist, song_album, song_cover, 1 AS weight, 0 AS heard, \'library\' AS origin FROM favorites WHERE user_id = ? LIMIT 5000', 'args' => [$userId]],
        ['sql' => 'SELECT ps.source, ps.song_id, ps.song_title, ps.song_artist, ps.song_album, ps.song_cover, 1 AS weight, 0 AS heard, \'library\' AS origin FROM playlist_songs ps INNER JOIN playlists p ON p.id = ps.playlist_id WHERE p.user_id = ? LIMIT 10000', 'args' => [$userId]],
        ['sql' => 'SELECT source, song_id, song_title, song_artist, song_album, song_cover, GREATEST(1, listen_count) AS weight, 1 AS heard, \'history\' AS origin FROM listen_history WHERE user_id = ? ORDER BY listened_at DESC LIMIT 10000', 'args' => [$userId]],
    ];
    foreach ($queries as $query) {
        try {
            $stmt = $db->prepare($query['sql']);
            $stmt->execute($query['args']);
            foreach ($stmt as $row) $rows[] = $row;
        } catch (Throwable $error) {
            error_log('heart mode on-demand profile source skipped: ' . $error->getMessage());
        }
    }
    usort($rows, static fn(array $left, array $right): int => ((int)($right['heard'] ?? 0) <=> (int)($left['heard'] ?? 0)) ?: ((int)($right['weight'] ?? 0) <=> (int)($left['weight'] ?? 0)));
    $profileData = heartModeBuildProfile($rows);
    $profileData['recent_exclusions'] = array_slice(array_keys($profileData['heard_songs'] ?? []), 0, 100);
    $write = $db->prepare('INSERT INTO heart_mode_user_profiles (user_id, profile_version, profile_json, recent_recommendation_keys, built_at, next_build_at) VALUES (?, 1, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE profile_version = profile_version + 1, profile_json = VALUES(profile_json), recent_recommendation_keys = VALUES(recent_recommendation_keys), built_at = NOW(), next_build_at = VALUES(next_build_at)');
    $write->execute([$userId, json_encode($profileData, JSON_UNESCAPED_UNICODE), '[]']);
    return $profileData;
}

function heartModeSearchPayload(array $profileData): array {
    $profileData = heartModeEnabledProfile($profileData);
    return [
        'search_context' => heartModeSearchContext($profileData),
        'profile_candidates' => heartModeProfileCandidateMetadata($profileData),
        'priority_artists' => $profileData['priority_artists'] ?? ['history' => [], 'library' => []],
        'priority_songs' => $profileData['priority_songs'] ?? ['history' => [], 'library' => []],
    ];
}

function heartModeRecommend(PDO $db, int $userId, array $input): void {
    $limit = (int)($input['limit'] ?? 10);
    if ($limit < 1 || $limit > 10) heartModeRespond(['success' => false, 'error_code' => 'INVALID_LIMIT', 'message' => '推荐数量无效'], 422);
    $exclude = array_values(array_unique(array_filter(array_map('strval', is_array($input['exclude_keys'] ?? null) ? $input['exclude_keys'] : []))));
    if (count($exclude) > 100) heartModeRespond(['success' => false, 'error_code' => 'INVALID_EXCLUSIONS', 'message' => '排除列表过大'], 422);
    $profileStmt = $db->prepare('SELECT profile_version, profile_json, next_build_at FROM heart_mode_user_profiles WHERE user_id = ? LIMIT 1');
    $profileStmt->execute([$userId]);
    $profile = $profileStmt->fetch(PDO::FETCH_ASSOC);
    $profileData = $profile ? json_decode((string)$profile['profile_json'], true) : [];
    $profileData = is_array($profileData) ? $profileData : [];
    $profileStale = !$profile || !$profileData || !$profile['next_build_at'] || strtotime((string)$profile['next_build_at']) < time();
    if ($profileStale) {
        $profileData = heartModeBuildUserProfile($db, $userId);
        $profile = [
            'profile_version' => (int)($profile['profile_version'] ?? 0) + 1,
            'next_build_at' => date('Y-m-d H:i:s', time() + 86400),
        ];
        $profileStale = false;
    }
    $profileData = heartModeEnabledProfile($profileData);
    if (is_array($profileData['candidate_songs'] ?? null)) {
        $candidates = [];
        foreach ($profileData['candidate_songs'] as $candidate) {
            if (!is_array($candidate)) continue;
            $source = strtolower(trim((string)($candidate['source'] ?? '')));
            $songId = trim((string)($candidate['id'] ?? ''));
            if ($source === '' || $songId === '') continue;
            $key = heartModeNormalizeKey($source, $songId);
            if (in_array($key, $exclude, true)) continue;
            $artist = heartModeNormalizeArtist((string)($candidate['artist'] ?? ''));
            $preference = heartModeProfilePreferenceWeight($profileData, $source, $artist);
            $heard = !empty($candidate['heard']) || !empty($profileData['heard_songs'][$key]);
            $cover = heartModeNormalizeCover($source, (string)($candidate['pic_id'] ?? ''), $songId);
            if ($cover === '') continue;
            $candidates[] = [
                'key' => $key,
                'artist' => $artist,
                'heard' => $heard,
                'score' => (2 * log(1 + $preference)) - ($heard ? 2 : 0),
                'preference' => $preference,
                'row' => [
                    'song_id' => $songId,
                    'source' => $source,
                    'song_title' => (string)($candidate['name'] ?? ''),
                    'song_artist' => $artist,
                    'song_album' => (string)($candidate['album'] ?? ''),
                    'song_cover' => $cover,
                ],
            ];
        }
        $songs = [];
        foreach (heartModeSelectCandidates($candidates, $limit) as $candidate) {
            $row = $candidate['row'];
            $songs[] = ['id' => (string)$row['song_id'], 'source' => (string)$row['source'], 'name' => (string)$row['song_title'], 'artist' => (string)$row['song_artist'], 'album' => (string)$row['song_album'], 'pic_id' => (string)$row['song_cover'], 'coverUrl' => (string)$row['song_cover'], 'rank' => count($songs) + 1];
        }
        if (count($songs) < $limit || $profileStale) {
            heartModeMetric($db, $profileStale ? 'profile_stale' : 'candidate_shortage');
            heartModeRespond(array_merge(['success' => true, 'mode' => 'fallback_recommendation', 'error_code' => $profileStale ? 'PROFILE_STALE' : 'CANDIDATE_SHORTAGE', 'batch_id' => bin2hex(random_bytes(8)), 'profile_version' => (int)($profile['profile_version'] ?? 0), 'songs' => $songs], heartModeSearchPayload($profileData)));
        }
        heartModeMetric($db, 'recommendation_success');
        heartModeRespond(array_merge(['success' => true, 'mode' => 'heart', 'batch_id' => bin2hex(random_bytes(8)), 'profile_version' => (int)($profile['profile_version'] ?? 0), 'songs' => $songs], heartModeSearchPayload($profileData)));
    }
    heartModeMetric($db, 'candidate_shortage');
    heartModeRespond(array_merge(['success' => true, 'mode' => 'fallback_recommendation', 'error_code' => 'PROFILE_EMPTY', 'batch_id' => bin2hex(random_bytes(8)), 'profile_version' => (int)($profile['profile_version'] ?? 0), 'songs' => []], heartModeSearchPayload($profileData)));
    $params = [];
    $sql = 'SELECT source, song_id, song_title, song_artist, song_album, song_cover, hot_score FROM heart_mode_song_stats';
    $conditions = [];
    if ($exclude) { $conditions[] = 'CONCAT(source, ":", song_id) NOT IN (' . implode(',', array_fill(0, count($exclude), '?')) . ')'; $params = array_merge($params, $exclude); }
    if ($conditions) $sql .= ' WHERE ' . implode(' AND ', $conditions);
    $sql .= ' ORDER BY hot_score DESC, last_played_at DESC LIMIT 500';
    $stmt = $db->prepare($sql); $stmt->execute($params);
    $songs = []; $artists = [];
    $candidates = [];
    foreach ($stmt as $row) {
        $source = strtolower((string)$row['source']);
        $artist = heartModeNormalizeArtist((string)$row['song_artist']);
        $key = heartModeNormalizeKey($source, (string)$row['song_id']);
        $heard = !empty($profileData['heard_songs'][$key]);
        $preference = heartModeProfilePreferenceWeight($profileData, $source, $artist);
        $candidates[] = ['row' => $row, 'key' => $key, 'artist' => $artist, 'heard' => $heard, 'score' => ((float)$row['hot_score']) + (2 * log(1 + $preference)) - ($heard ? 2 : 0), 'preference' => $preference];
    }
    usort($candidates, static fn(array $left, array $right): int => $right['score'] <=> $left['score']);
    $songs = []; $artists = []; $selectedKeys = [];
    if (false) foreach ([false, true] as $heardBucket) {
        foreach ($candidates as $candidate) {
            if (count($songs) >= $limit) break 2;
            if ($candidate['heard'] !== $heardBucket || isset($selectedKeys[$candidate['key']])) continue;
            if ($candidate['artist'] !== '' && end($artists) === $candidate['artist']) continue;
            $row = $candidate['row'];
            $source = strtolower((string)$row['source']);
            $songs[] = ['id' => (string)$row['song_id'], 'source' => $source, 'name' => (string)$row['song_title'], 'artist' => $candidate['artist'], 'album' => (string)$row['song_album'], 'pic_id' => (string)$row['song_cover'], 'rank' => count($songs) + 1, 'recommendation_reason' => $candidate['preference'] > 0 ? '来自你常听的歌手（' . $source . '）' : ($candidate['heard'] ? '来自你的近期播放记录' : '根据全站热度推荐')];
            $artists[] = $candidate['artist'];
            $selectedKeys[$candidate['key']] = true;
        }
    }
    $songs = []; $artists = [];
    foreach (heartModeSelectCandidates($candidates, $limit) as $candidate) {
        $row = $candidate['row'];
        $source = strtolower((string)$row['source']);
        $cover = heartModeNormalizeCover($source, (string)$row['song_cover'], (string)$row['song_id']);
        $songs[] = ['id' => (string)$row['song_id'], 'source' => $source, 'name' => (string)$row['song_title'], 'artist' => $candidate['artist'], 'album' => (string)$row['song_album'], 'pic_id' => $cover, 'coverUrl' => $cover, 'rank' => count($songs) + 1];
        $artists[] = $candidate['artist'];
    }
    /* Legacy loop removed: candidate scoring above is the only heart-mode path. */
    /*
    foreach ($stmt as $row) {
        if (count($songs) >= $limit) break;
        $artist = trim((string)$row['song_artist']);
        if ($artist !== '' && end($artists) === $artist) continue;
        $key = heartModeNormalizeKey((string)$row['source'], (string)$row['song_id']);
        $songs[] = ['id' => (string)$row['song_id'], 'source' => (string)$row['source'], 'name' => (string)$row['song_title'], 'artist' => $artist, 'album' => (string)$row['song_album'], 'pic_id' => (string)$row['song_cover'], 'rank' => count($songs) + 1, 'recommendation_reason' => in_array($artist, $preferredArtists, true) ? '来自你常听的歌手' : '根据全站热度推荐'];
        $artists[] = $artist;
    }
    */
    if (count($songs) < $limit || $profileStale) {
        heartModeMetric($db, $profileStale ? 'profile_stale' : 'candidate_shortage');
        heartModeRespond(['success' => true, 'mode' => 'fallback_recommendation', 'error_code' => $profileStale ? 'PROFILE_STALE' : 'CANDIDATE_SHORTAGE', 'batch_id' => bin2hex(random_bytes(8)), 'profile_version' => (int)($profile['profile_version'] ?? 0), 'songs' => $songs]);
    }
    heartModeMetric($db, 'recommendation_success');
    heartModeRespond(['success' => true, 'mode' => 'heart', 'batch_id' => bin2hex(random_bytes(8)), 'profile_version' => (int)($profile['profile_version'] ?? 0), 'songs' => $songs]);
}

function heartModeSyncSignals(PDO $db, int $userId, array $input): void {
    $batchId = trim((string)($input['client_batch_id'] ?? ''));
    $signals = $input['signals'] ?? [];
    if ($batchId === '' || !is_array($signals) || count($signals) > 50) heartModeRespond(['success' => false, 'error_code' => 'INVALID_SIGNALS', 'message' => '行为摘要无效'], 422);
    $claim = $db->prepare('INSERT IGNORE INTO heart_mode_signal_batches (user_id, client_batch_id) VALUES (?, ?)');
    $claim->execute([$userId, $batchId]);
    if ($claim->rowCount() === 0) heartModeRespond(['success' => true, 'idempotent' => true, 'accepted' => 0]);
    $upsert = $db->prepare('INSERT INTO heart_mode_user_signals (user_id, source, song_id, completed_count, skipped_count, play_count, last_played_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE completed_count = completed_count + VALUES(completed_count), skipped_count = skipped_count + VALUES(skipped_count), play_count = play_count + VALUES(play_count), last_played_at = GREATEST(COALESCE(last_played_at, VALUES(last_played_at)), VALUES(last_played_at))');
    $accepted = 0;
    foreach ($signals as $signal) {
        if (!is_array($signal)) continue;
        $source = preg_replace('/[^a-z0-9_-]/i', '', (string)($signal['source'] ?? ''));
        if (!(xcloudFeatures()['sources'][strtolower($source)] ?? false)) continue;
        $songId = trim((string)($signal['song_id'] ?? ''));
        if ($source === '' || $songId === '' || strlen($songId) > 80) continue;
        $date = date('Y-m-d H:i:s', min(time(), max(0, strtotime((string)($signal['last_played_at'] ?? '')) ?: time())));
        $upsert->execute([$userId, $source, $songId, min(1, max(0, (int)($signal['completed'] ?? 0))), min(1, max(0, (int)($signal['skipped'] ?? 0))), min(20, max(0, (int)($signal['play_count'] ?? 0))), $date]);
        $accepted++;
    }
    heartModeMetric($db, 'sync_accepted', $accepted ?: 1);
    heartModeRespond(['success' => true, 'idempotent' => false, 'accepted' => $accepted]);
}

xcloudRequireFeature('heartMode');
require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once __DIR__ . '/config.php';

$input = heartModeInput();
$userId = heartModeUserId($input);
try {
    $db = getDBConnection();
    $action = (string)($input['action'] ?? 'status');
    if ($action === 'recommend') heartModeRecommend($db, $userId, $input);
    if ($action === 'sync_signals') heartModeSyncSignals($db, $userId, $input);
    if ($action === 'status') heartModeRespond(['success' => true, 'mode' => 'heart', 'available' => true]);
    heartModeRespond(['success' => false, 'error_code' => 'INVALID_ACTION', 'message' => '不支持的操作'], 422);
} catch (Throwable $error) {
    error_log('heart mode request failed: ' . $error->getMessage());
    heartModeRespond(['success' => false, 'error_code' => 'DATABASE_UNAVAILABLE', 'message' => '推荐服务暂时不可用'], 503);
}
