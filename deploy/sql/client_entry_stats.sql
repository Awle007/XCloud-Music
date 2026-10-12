CREATE TABLE IF NOT EXISTS `client_entry_stats` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visit_date` DATE NOT NULL,
  `visitor_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `client_type` VARCHAR(16) NOT NULL,
  `visit_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `first_seen_at` DATETIME NOT NULL,
  `last_seen_at` DATETIME NOT NULL,
  `last_counted_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_client_entry_daily` (`visit_date`, `visitor_hash`, `client_type`),
  KEY `idx_client_entry_date_type` (`visit_date`, `client_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
