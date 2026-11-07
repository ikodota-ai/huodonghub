-- 大屏图表显示：Y 轴刻度、柱顶副数值（折算/分数），默认保持原有显示
ALTER TABLE `vote_rounds`
  ADD COLUMN `screen_show_axis` TINYINT NOT NULL DEFAULT 1 AFTER `screen_show_part`,
  ADD COLUMN `screen_show_contribution` TINYINT NOT NULL DEFAULT 1 AFTER `screen_show_axis`;
