-- 投票群体计分方式：participants=票/参与人数（默认，1人1票传统口径，得票率封顶100%）
-- top=相对最高票（0票=0%，范围内最高票=100%，其余线性） share=票仓占比（个人票/范围总票数）
ALTER TABLE `vote_groups` ADD COLUMN `vote_mode` VARCHAR(16) NOT NULL DEFAULT 'participants' AFTER `pct_mode`;
