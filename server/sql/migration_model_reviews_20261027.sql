-- Append-only human decisions; no existing model, binding or inventory row changes.
CREATE TABLE IF NOT EXISTS part_model_reviews (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 model_id BIGINT UNSIGNED NOT NULL,
 status VARCHAR(20) NOT NULL,
 note VARCHAR(2000) NOT NULL,
 actor_id BIGINT UNSIGNED NOT NULL,
 actor_name VARCHAR(100) NOT NULL,
 reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 model_file_hash CHAR(64) CHARACTER SET ascii DEFAULT NULL,
 version_snapshot JSON NOT NULL,
 reference_type VARCHAR(40) NOT NULL,
 reference_part_id BIGINT UNSIGNED DEFAULT NULL,
 reference_snapshot JSON NOT NULL,
 checks_json JSON NOT NULL,
 request_id VARCHAR(80) CHARACTER SET ascii NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 KEY idx_model_review_latest(model_id,id),
 UNIQUE KEY uk_model_review_request(actor_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
