<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/_features.php';
require_once __DIR__ . '/heart_mode_profile.php';
ini_set('max_execution_time', '30');

function heartModeArgs(array $argv): array {
    $args = [];
    foreach (array_slice($argv, 1) as $value) {
        if (str_starts_with($value, '--') && str_contains($value, '=')) {
            [$key, $item] = explode('=', substr($value, 2), 2);
            $args[$key] = $item;
        }
    }
    return $args;
}

function heartModeEnsureMigration(PDO $db): void {
    try {
        $marker = $db->query("SELECT 1 FROM heart_mode_migrations WHERE version = '2026-09-09-heart-mode' LIMIT 1");
        if ($marker && $marker->fetchColumn()) return;
    } catch (Throwable $error) {
        // First install: the migration table itself may not exist yet.
    }
    $migrationPaths = [
        __DIR__ . '/../sql/2026-09-09-heart-mode.sql',
        __DIR__ . '/2026-09-09-heart-mode.sql',
    ];
    $sql = false;
    foreach ($migrationPaths as $path) {
        if (is_file($path)) { $sql = file_get_contents($path); break; }
    }
    if ($sql === false) {
        $requiredTables = ['heart_mode_migrations', 'heart_mode_song_stats', 'heart_mode_cooccurrence', 'heart_mode_user_profiles', 'heart_mode_user_signals', 'heart_mode_signal_batches', 'heart_mode_metrics'];
        $check = $db->prepare('SHOW TABLES LIKE ?');
        foreach ($requiredTables as $table) {
            $check->execute([$table]);
            if (!$check->fetchColumn()) throw new RuntimeException('heart mode migration file missing and migration already exists only partially');
        }
        return;
    }
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) $db->exec($statement);
}

function heartModeRebuildGlobal(PDO $db): void {
    $db->exec('DELETE FROM heart_mode_song_stats');
    $sources = [
        "SELECT source, song_id, song_title, song_artist, song_album, song_cover, 1 AS play_count, added_at AS played_at FROM favorites",
        "SELECT source, song_id, song_title, song_artist, song_album, song_cover, 1 AS play_count, added_at AS played_at FROM playlist_songs",
        "SELECT source, song_id, song_title, song_artist, song_album, song_cover, listen_count AS play_count, listened_at AS played_at FROM listen_history",
    ];
    $insert = $db->prepare('INSERT INTO heart_mode_song_stats (source, song_id, song_title, song_artist, song_album, song_cover, play_count, last_played_at, hot_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE play_count = play_count + VALUES(play_count), last_played_at = GREATEST(COALESCE(last_played_at, VALUES(last_played_at)), VALUES(last_played_at)), hot_score = hot_score + VALUES(hot_score)');
    foreach ($sources as $sourceSql) {
        try {
            foreach ($db->query($sourceSql) as $row) {
                $score = 1 + (strtotime((string)$row['played_at']) > time() - 30 * 86400 ? 1 : 0);
                $insert->execute([$row['source'], $row['song_id'], $row['song_title'], $row['song_artist'], $row['song_album'], $row['song_cover'], (int)$row['play_count'], $row['played_at'], $score]);
            }
        } catch (Throwable $error) {
            error_log('heart mode source skipped: ' . $error->getMessage());
        }
    }
}

function heartModeUserRows(PDO $db, int $userId): array {
    $rows = [];
    $queries = [
        [
            'sql' => 'SELECT source, song_id, song_title, song_artist, song_album, song_cover, 1 AS weight, 0 AS heard, \'library\' AS origin FROM favorites WHERE user_id = ? LIMIT 5000',
            'args' => [$userId],
        ],
        [
            'sql' => 'SELECT ps.source, ps.song_id, ps.song_title, ps.song_artist, ps.song_album, ps.song_cover, 1 AS weight, 0 AS heard, \'library\' AS origin FROM playlist_songs ps INNER JOIN playlists p ON p.id = ps.playlist_id WHERE p.user_id = ? LIMIT 10000',
            'args' => [$userId],
        ],
        [
            'sql' => 'SELECT source, song_id, song_title, song_artist, song_album, song_cover, GREATEST(1, listen_count) AS weight, 1 AS heard, \'history\' AS origin FROM listen_history WHERE user_id = ? ORDER BY listened_at DESC LIMIT 10000',
            'args' => [$userId],
        ],
    ];
    foreach ($queries as $query) {
        try {
            $stmt = $db->prepare($query['sql']);
            $stmt->execute($query['args']);
            foreach ($stmt as $row) $rows[] = $row;
        } catch (Throwable $error) {
            error_log('heart mode profile source skipped: ' . $error->getMessage());
        }
    }
    usort($rows, static function (array $left, array $right): int {
        return ((int)($right['heard'] ?? 0) <=> (int)($left['heard'] ?? 0))
            ?: ((int)($right['weight'] ?? 0) <=> (int)($left['weight'] ?? 0));
    });
    return $rows;
}

function heartModeRebuildUsers(PDO $db, ?int $userId = null): void {
    $query = 'SELECT id FROM users' . ($userId ? ' WHERE id = ?' : '') . ' ORDER BY id';
    $stmt = $db->prepare($query);
    $stmt->execute($userId ? [$userId] : []);
    $write = $db->prepare('INSERT INTO heart_mode_user_profiles (user_id, profile_version, profile_json, recent_recommendation_keys, built_at, next_build_at) VALUES (?, 1, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE profile_version = profile_version + 1, profile_json = VALUES(profile_json), recent_recommendation_keys = VALUES(recent_recommendation_keys), built_at = NOW(), next_build_at = VALUES(next_build_at)');
    foreach ($stmt as $user) {
        $profile = heartModeBuildProfile(heartModeUserRows($db, (int)$user['id']));
        $profile['recent_exclusions'] = array_slice(array_keys($profile['heard_songs']), 0, 100);
        $write->execute([(int)$user['id'], json_encode($profile, JSON_UNESCAPED_UNICODE), '[]']);
    }
}

// --force 仅用于首次画像准备，始终要求公共登录模块开启。
xcloudRequireFeature('login');
if (!in_array('--force', $argv, true)) xcloudRequireFeature('heartMode');
require_once __DIR__ . '/config.php';
$args = heartModeArgs($argv);
$mode = $args['mode'] ?? '';
if (!in_array($mode, ['global', 'users', 'user'], true)) { fwrite(STDERR, "Usage: --mode=global|users|user [--user-id=ID] [--force]\n"); exit(2); }
$db = getDBConnection();
$db->exec('SET SESSION MAX_EXECUTION_TIME = 30000');
heartModeEnsureMigration($db);
$lockPath = __DIR__ . '/../cache/heart_mode_rebuild.lock';
if (!is_dir(dirname($lockPath))) mkdir(dirname($lockPath), 0750, true);
$lock = fopen($lockPath, 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { fwrite(STDERR, "heart mode rebuild is already running\n"); exit(3); }
try {
    if ($mode === 'global') heartModeRebuildGlobal($db);
    else heartModeRebuildUsers($db, $mode === 'user' ? (int)($args['user-id'] ?? 0) : null);
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}
echo "heart mode rebuild complete: {$mode}\n";
