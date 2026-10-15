-- AlterTable
ALTER TABLE `video_groups` ADD COLUMN `owner_id` BIGINT NULL;

-- AlterTable
ALTER TABLE `votes` ADD COLUMN `owner_id` BIGINT NULL;

-- CreateIndex
CREATE INDEX `video_groups_owner_id_idx` ON `video_groups`(`owner_id`);

-- CreateIndex
CREATE INDEX `votes_owner_id_idx` ON `votes`(`owner_id`);

-- AddForeignKey
ALTER TABLE `video_groups` ADD CONSTRAINT `video_groups_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `votes` ADD CONSTRAINT `votes_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 存量内容归属：全部归到第一个 admin 账号名下（维护人员/编辑后续可由 admin 用 SQL 移交）
UPDATE votes SET owner_id = (SELECT MIN(id) FROM users WHERE role = 'admin') WHERE owner_id IS NULL;
UPDATE video_groups SET owner_id = (SELECT MIN(id) FROM users WHERE role = 'admin') WHERE owner_id IS NULL;
