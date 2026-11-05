-- 投票级大屏主视觉：独立于手机端 cover；dim 为暗化百分比（60-90）
ALTER TABLE `votes`
  ADD COLUMN `screen_bg_enabled` TINYINT NOT NULL DEFAULT 0 AFTER `cover`,
  ADD COLUMN `screen_bg_image` VARCHAR(255) NULL AFTER `screen_bg_enabled`,
  ADD COLUMN `screen_bg_dim` INT NOT NULL DEFAULT 78 AFTER `screen_bg_image`;
