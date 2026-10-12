CREATE TABLE IF NOT EXISTS listen_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    song_id VARCHAR(120) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'netease',
    song_title VARCHAR(255) NOT NULL,
    song_artist VARCHAR(255) NOT NULL,
    song_cover VARCHAR(512) DEFAULT '',
    song_album VARCHAR(255) DEFAULT '',
    listen_count INT NOT NULL DEFAULT 1,
    listened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_history_song (user_id, song_id, source),
    INDEX idx_history_user_time (user_id, listened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
