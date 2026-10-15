-- AlterTable
ALTER TABLE `vote_groups` ADD COLUMN `avg_mode` VARCHAR(16) NOT NULL DEFAULT 'scorers',
    ADD COLUMN `pct_mode` VARCHAR(16) NOT NULL DEFAULT 'batch';
