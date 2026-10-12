<?php
declare(strict_types=1);

$dbFile = tempnam(sys_get_temp_dir(), 'heart-mode-') . '.sqlite';
$pdo = new PDO('sqlite:' . $dbFile);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$sql = file_get_contents(__DIR__ . '/../deploy/sql/2026-09-09-heart-mode.sql');
if ($sql === false) throw new RuntimeException('migration missing');
$sql = preg_replace('/ENGINE=InnoDB|DEFAULT CHARSET=utf8mb4|COLLATE=utf8mb4_unicode_ci/i', '', $sql);
$sql = preg_replace('/INSERT\s+IGNORE/i', 'INSERT OR IGNORE', $sql);
$sql = preg_replace('/\s+ON UPDATE CURRENT_TIMESTAMP/i', '', $sql);
$sql = preg_replace('/INT AUTO_INCREMENT PRIMARY KEY/i', 'INTEGER PRIMARY KEY AUTOINCREMENT', $sql);
$sql = preg_replace('/\b(?:BIGINT|INT|TINYINT)\b[^,\)]*/i', 'INTEGER', $sql);
$sql = preg_replace('/VARCHAR\(\d+\)|TEXT|JSON|DATETIME|DECIMAL\(\d+,\d+\)/i', 'TEXT', $sql);
$sql = preg_replace('/UNIQUE\s+KEY\s+\w+\s*\(([^)]+)\)/i', 'UNIQUE ($1)', $sql);
$sql = preg_replace('/KEY\s+\w+\s*\(([^)]+)\)/i', 'INDEX ($1)', $sql);
$sql = preg_replace('/,\s*INDEX\s*\([^)]+\)/i', '', $sql);
$sql = str_replace('CURRENT_TIMESTAMP', "CURRENT_TIMESTAMP", $sql);
$sql = preg_replace('/UNIQUE KEY `([^`]+)` \(([^)]+)\)/i', 'UNIQUE ($2)', $sql);
$sql = preg_replace('/KEY `[^`]+` \(([^)]+)\)/i', 'INDEX ($1)', $sql);
$sql = preg_replace('/CREATE TABLE IF NOT EXISTS `([^`]+)`/i', 'CREATE TABLE IF NOT EXISTS $1', $sql);
$sql = preg_replace('/`([^`]+)`/', '$1', $sql);
$sql = preg_replace('/;\s*CREATE/', ";\nCREATE", $sql);
$sourceSql = file_get_contents(__DIR__ . '/../deploy/sql/2026-09-09-heart-mode.sql');
if ($sourceSql === false || !str_contains($sourceSql, 'idx_heart_hot') || !str_contains($sourceSql, 'unique_heart_song')) throw new RuntimeException('migration indexes missing');
$pdo->exec($sql);
$pdo->exec($sql);
$expected = ['heart_mode_song_stats', 'heart_mode_cooccurrence', 'heart_mode_user_profiles', 'heart_mode_user_signals', 'heart_mode_signal_batches', 'heart_mode_metrics', 'heart_mode_migrations'];
foreach ($expected as $table) {
    $stmt = $pdo->prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?");
    $stmt->execute([$table]);
    if (!$stmt->fetchColumn()) throw new RuntimeException("missing table: $table");
}
echo "heart mode migration smoke test passed\n";
$stmt = null;
$pdo = null;
unlink($dbFile);
