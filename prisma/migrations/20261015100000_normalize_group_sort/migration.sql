-- 评审群体展示顺序规范化：预设群体固定为 专家评审 1 / 大众评审 2 / 观众评审 3，
-- 自定义群体整体后移（保持原有相对顺序）。修复历史投票"观众排在大众前"的显示错乱。
UPDATE vote_groups
SET sort = CASE name
  WHEN '专家评审' THEN 1
  WHEN '大众评审' THEN 2
  WHEN '观众评审' THEN 3
  ELSE sort + 10
END;
