CREATE TABLE IF NOT EXISTS heart_mode_migrations (
    version VARCHAR(64) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS heart_mode_song_stats (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(20) NOT NULL,
    song_id VARCHAR(80) NOT NULL,
    song_title VARCHAR(255) NOT NULL DEFAULT '',
    song_artist VARCHAR(255) NOT NULL DEFAULT '',
    song_album VARCHAR(255) NOT NULL DEFAULT '',
    song_cover VARCHAR(512) NOT NULL DEFAULT '',
    play_count INT UNSIGNED NOT NULL DEFAULT 0,
    unique_listener_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_played_at DATETIME NULL,
    hot_score DECIMAL(12,4) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_heart_song (source, song_id),
    KEY idx_heart_artist (song_artist),
    KEY idx_heart_hot (hot_score, last_played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS heart_mode_cooccurrence (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    left_key VARCHAR(120) NOT NULL,
    right_key VARCHAR(120) NOT NULL,
    left_artist VARCHAR(255) NOT NULL DEFAULT '',
    right_artist VARCHAR(255) NOT NULL DEFAULT '',
    occurrence_count INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_heart_pair (left_key, right_key),
    KEY idx_heart_left (left_key, occurrence_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS heart_mode_user_profiles (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    profile_version INT UNSIGNED NOT NULL DEFAULT 1,
    profile_json JSON NOT NULL,
    recent_recommendation_keys JSON NOT NULL,
    built_at DATETIME NOT NULL,
    next_build_at DATETIME NOT NULL,
    KEY idx_heart_profile_refresh (next_build_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS heart_mode_user_signals (
    user_id INT UNSIGNED NOT NULL,
    source VARCHAR(20) NOT NULL,
    song_id VARCHAR(80) NOT NULL,
    completed_count INT UNSIGNED NOT NULL DEFAULT 0,
    skipped_count INT UNSIGNED NOT NULL DEFAULT 0,
    play_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_played_at DATETIME NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, source, song_id),
    KEY idx_heart_user_recent (user_id, last_played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS heart_mode_signal_batches (
    user_id INT UNSIGNED NOT NULL,
    client_batch_id VARCHAR(80) NOT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, client_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS heart_mode_metrics (
    metric_date DATE NOT NULL,
    metric_name VARCHAR(64) NOT NULL,
    metric_value INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (metric_date, metric_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO heart_mode_migrations (version) VALUES ('2026-09-09-heart-mode');
