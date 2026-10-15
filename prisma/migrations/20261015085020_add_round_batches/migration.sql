-- AlterTable
ALTER TABLE `round_contestants` ADD COLUMN `batch` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `seq` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `vote_rounds` ADD COLUMN `current_batch` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `round_contestants_round_id_batch_idx` ON `round_contestants`(`round_id`, `batch`);
