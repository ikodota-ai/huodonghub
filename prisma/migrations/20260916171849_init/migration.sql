-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `role` VARCHAR(16) NOT NULL DEFAULT 'editor',
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` BIGINT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_groups` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `cover` VARCHAR(255) NULL,
    `description` VARCHAR(500) NULL,
    `password` VARCHAR(64) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `video_groups_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `videos` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `group_id` BIGINT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `cover_path` VARCHAR(255) NULL,
    `duration` INTEGER NOT NULL DEFAULT 0,
    `file_size` BIGINT NOT NULL DEFAULT 0,
    `width` INTEGER NOT NULL DEFAULT 0,
    `height` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(16) NOT NULL DEFAULT 'upload',
    `source_url` VARCHAR(500) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `process_status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `videos_group_id_idx`(`group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `votes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `cover` VARCHAR(255) NULL,
    `description` VARCHAR(500) NULL,
    `wx_appid` VARCHAR(64) NULL,
    `wx_secret` VARCHAR(128) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vote_rounds` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `vote_id` BIGINT NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `seq` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `code` VARCHAR(16) NOT NULL,
    `audience_start_at` DATETIME(3) NULL,
    `audience_end_at` DATETIME(3) NULL,
    `screen_show_result` TINYINT NOT NULL DEFAULT 1,
    `audience_show_result` TINYINT NOT NULL DEFAULT 0,
    `screen_group_id` BIGINT NULL,
    `screen_qr_mode` TINYINT NOT NULL DEFAULT 1,
    `countdown_ends_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vote_rounds_code_key`(`code`),
    INDEX `vote_rounds_vote_id_idx`(`vote_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vote_contestants` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `vote_id` BIGINT NOT NULL,
    `number` VARCHAR(8) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `intro` VARCHAR(1000) NULL,
    `image` VARCHAR(255) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `vote_contestants_vote_id_idx`(`vote_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `round_contestants` (
    `round_id` BIGINT NOT NULL,
    `contestant_id` BIGINT NOT NULL,

    PRIMARY KEY (`round_id`, `contestant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vote_groups` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `round_id` BIGINT NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `weight` DECIMAL(5, 2) NOT NULL,
    `max_score` INTEGER NOT NULL DEFAULT 100,
    `max_votes` INTEGER NOT NULL DEFAULT 3,
    `allow_repeat` TINYINT NOT NULL DEFAULT 0,
    `fixed_points` DECIMAL(8, 2) NULL,
    `restricted` TINYINT NOT NULL DEFAULT 1,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `vote_groups_round_id_idx`(`round_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voters` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `group_id` BIGINT NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `need_bind` TINYINT NOT NULL DEFAULT 1,
    `bound_key` VARCHAR(128) NULL,
    `bound_at` DATETIME(3) NULL,
    `has_voted` TINYINT NOT NULL DEFAULT 0,
    `voted_at` DATETIME(3) NULL,

    UNIQUE INDEX `voters_token_key`(`token`),
    INDEX `voters_group_id_idx`(`group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_entries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `group_id` BIGINT NOT NULL,
    `voter_id` BIGINT NOT NULL,
    `contestant_id` BIGINT NOT NULL,
    `score` DECIMAL(5, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `score_entries_group_id_voter_id_contestant_id_key`(`group_id`, `voter_id`, `contestant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vote_entries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `group_id` BIGINT NOT NULL,
    `contestant_id` BIGINT NOT NULL,
    `voter_key` VARCHAR(128) NOT NULL,
    `ip` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vote_entries_group_id_voter_key_idx`(`group_id`, `voter_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_stats` (
    `group_id` BIGINT NOT NULL,
    `contestant_id` BIGINT NOT NULL,
    `value_cache` DECIMAL(12, 2) NOT NULL DEFAULT 0,

    PRIMARY KEY (`group_id`, `contestant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(64) NOT NULL,
    `value` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `videos` ADD CONSTRAINT `videos_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `video_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vote_rounds` ADD CONSTRAINT `vote_rounds_vote_id_fkey` FOREIGN KEY (`vote_id`) REFERENCES `votes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vote_contestants` ADD CONSTRAINT `vote_contestants_vote_id_fkey` FOREIGN KEY (`vote_id`) REFERENCES `votes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `round_contestants` ADD CONSTRAINT `round_contestants_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `vote_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `round_contestants` ADD CONSTRAINT `round_contestants_contestant_id_fkey` FOREIGN KEY (`contestant_id`) REFERENCES `vote_contestants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vote_groups` ADD CONSTRAINT `vote_groups_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `vote_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voters` ADD CONSTRAINT `voters_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `vote_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_entries` ADD CONSTRAINT `score_entries_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `vote_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_entries` ADD CONSTRAINT `score_entries_voter_id_fkey` FOREIGN KEY (`voter_id`) REFERENCES `voters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vote_entries` ADD CONSTRAINT `vote_entries_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `vote_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_stats` ADD CONSTRAINT `group_stats_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `vote_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
