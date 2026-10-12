<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

if (in_array('--help', $argv, true) || in_array('-h', $argv, true)) {
    echo "用法：php scripts/init-database.php\n";
    echo "一次初始化基础业务、听歌历史、访问统计、心动推荐和后台管理员表。\n";
    echo "先创建空数据库并配置后端 .env；无需手动导入 sql/ 下的文件。\n";
    echo "重复执行保留已有数据与管理员；心动模式仍需重建画像并启用配置开关。\n";
    exit(0);
}

try {
    $root = dirname(__DIR__);
    $backend = is_file($root . '/php/config.php') ? $root . '/php' : $root . '/deploy/php';
    $sqlDirectory = dirname($backend) . '/sql';
    $adminInitializer = $root . '/admin/includes/db_init.php';

    // 先检查全部发布输入，避免文件缺失时已修改一部分表。
    foreach ([$backend . '/_env.php', $backend . '/config.php', $adminInitializer] as $file) {
        if (!is_readable($file)) throw new RuntimeException('缺少初始化文件：' . $file);
    }
    $migrations = [];
    foreach (['listen_history.sql', 'client_entry_stats.sql', '2026-09-09-heart-mode.sql'] as $name) {
        $file = $sqlDirectory . '/' . $name;
        if (!is_readable($file)) throw new RuntimeException('缺少 SQL 文件：' . $name);
        $sql = file_get_contents($file);
        if ($sql === false || trim($sql) === '') throw new RuntimeException('SQL 文件为空或无法读取：' . $name);
        $migrations[$name] = $sql;
    }

    require_once $backend . '/_env.php';
    $adminName = xcloudEnv('ADMIN_USERNAME');
    $adminPassword = xcloudEnv('ADMIN_PASSWORD');
    if ($adminName === '' || strlen($adminPassword) < 12 || in_array($adminPassword, ['change-me-before-install', 'your_admin_password'], true)) {
        throw new RuntimeException('请设置 ADMIN_USERNAME 和至少 12 位的独立 ADMIN_PASSWORD。');
    }

    require_once $backend . '/config.php';
    echo "[1/5] 初始化基础业务表与兼容字段……\n";
    createTables();
    $db = getDBConnection();
    $step = 2;
    foreach ($migrations as $name => $sql) {
        echo '[' . $step++ . '/5] 执行 ' . $name . "……\n";
        $db->exec($sql);
    }
    echo "[5/5] 初始化后台表与管理员账户……\n";
    require_once $adminInitializer;

    $tables = [
        'users', 'user_tokens', 'playlists', 'playlist_songs', 'favorites',
        'password_resets', 'register_verification_codes', 'email_verification_codes',
        'listen_history', 'login_logs', 'admins', 'client_entry_stats',
        'heart_mode_migrations', 'heart_mode_song_stats', 'heart_mode_cooccurrence',
        'heart_mode_user_profiles', 'heart_mode_user_signals', 'heart_mode_signal_batches', 'heart_mode_metrics',
    ];
    $check = $db->prepare('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    foreach ($tables as $table) {
        $check->execute([$table]);
        if (!$check->fetchColumn()) throw new RuntimeException('初始化后缺少数据表：' . $table);
    }
    echo "\n数据库初始化完成，已确认全部 " . count($tables) . " 张表存在。已有数据与管理员账户保留。\n";
    echo "无需手动导入 SQL。启用心动模式前，请重建 global/users 画像并设置 XCLOUD_HEART_MODE_ENABLED=1。\n";
} catch (Throwable $error) {
    fwrite(STDERR, "\n数据库初始化失败：" . $error->getMessage() . "\n");
    fwrite(STDERR, "MySQL 建表操作可能已部分生效；修复错误后可重新执行本命令。\n");
    exit(1);
}
