ALTER TABLE `vote_groups`
  ADD COLUMN `score_mode` VARCHAR(16) NOT NULL DEFAULT 'single';

CREATE TABLE `score_criteria` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `max_score` DECIMAL(5,2) NOT NULL,
  `weight` DECIMAL(5,2) NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  UNIQUE INDEX `score_criteria_group_id_name_key` (`group_id`, `name`),
  INDEX `score_criteria_group_id_sort_idx` (`group_id`, `sort`),
  CONSTRAINT `score_criteria_group_id_fkey`
    FOREIGN KEY (`group_id`) REFERENCES `vote_groups` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `score_item_entries` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `score_entry_id` BIGINT NOT NULL,
  `criterion_id` BIGINT NOT NULL,
  `score` DECIMAL(5,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `score_item_entries_score_entry_id_criterion_id_key` (`score_entry_id`, `criterion_id`),
  INDEX `score_item_entries_criterion_id_idx` (`criterion_id`),
  CONSTRAINT `score_item_entries_score_entry_id_fkey`
    FOREIGN KEY (`score_entry_id`) REFERENCES `score_entries` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `score_item_entries_criterion_id_fkey`
    FOREIGN KEY (`criterion_id`) REFERENCES `score_criteria` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
