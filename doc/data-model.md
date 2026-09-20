# 数据模型设计

字符集 utf8mb4，所有表 InnoDB。以下为核心表设计（字段在实现时以迁移文件为准）。

## 平台层

### users 后台用户
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| username | varchar(64) | 唯一 |
| password_hash | varchar(255) | bcrypt |
| name | varchar(64) | 显示名 |
| role | varchar(16) | admin / editor |
| status | tinyint | 1 启用 0 停用 |
| created_at / updated_at | datetime | |

## 视频模块

### video_groups 视频分组（顶层独立实体）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| name | varchar(128) | 分组名（如"启动仪式""嘉宾采访"） |
| code | varchar(16) | 对外短码，唯一，/v/{code} |
| cover | varchar(255) | 分组封面 Banner，缺省用首视频封面 |
| description | varchar(500) | 描述 |
| password | varchar(64) | 访问密码，可空 |
| status | tinyint | 1 开放 0 暂停（暂停即客户不可见、不输出地址） |
| created_at / updated_at | datetime | |

### videos 视频
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| group_id | bigint FK | |
| title | varchar(255) | |
| file_path | varchar(255) | 随机路径，如 /media/{rand}/xxx.mp4 |
| cover_path | varchar(255) | ffmpeg 截图 |
| duration | int | 秒 |
| file_size | bigint | 字节 |
| width / height | int | 分辨率 |
| source | varchar(16) | upload / import（公众号导入）/ rescue（视频号抢救） |
| source_url | varchar(500) | 导入来源链接（溯源），可空 |
| sort | int | |
| status | tinyint | 1 上架 0 下架 |

## 投票模块

### votes 投票（顶层独立实体）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| name | varchar(128) | 如"第六届XX杯厨艺大赛" |
| cover | varchar(255) | 主视觉 |
| description | varchar(500) | 说明 |
| wx_appid | varchar(64) | 服务号 AppID，可空（2026-09-17 新增：每次投票独立配置，不同投票可用不同公众号） |
| wx_secret | varchar(128) | 服务号 AppSecret，可空 |
| status | varchar(16) | draft / active / finished / archived |
| created_at / updated_at | datetime | |

### vote_rounds 轮次
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| vote_id | bigint FK | |
| name | varchar(128) | 如"初赛""决赛" |
| seq | int | 轮次顺序 |
| status | varchar(16) | pending / active / finished |
| code | varchar(16) | 观众入口短码，/vote/{code} |
| audience_start_at / audience_end_at | datetime | 观众投票起止，可空（手动开关优先） |
| screen_show_result | tinyint | 大屏是否显示结果数值 |
| audience_show_result | tinyint | 观众端是否可查看结果 |

### vote_contestants 选手（挂投票，跨轮复用）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| vote_id | bigint FK | |
| number | varchar(8) | 编号，如"01" |
| name | varchar(128) | 选手/作品名 |
| intro | varchar(1000) | 简介（含地区/单位） |
| image | varchar(255) | 照片 |
| sort | int | |

### round_contestants 轮次参赛关系
| 字段 | 类型 | 说明 |
|---|---|---|
| round_id | bigint FK | 联合主键 |
| contestant_id | bigint FK | 联合主键 |

### vote_groups 群体（每轮 N 个，核心设计）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| round_id | bigint FK | |
| name | varchar(64) | 如 专业评委/观众投票/大众评委 |
| kind | varchar(8) | score（评分）/ vote（投票） |
| weight | decimal(5,2) | 权重百分比，轮内合计 100 |
| max_score | int | kind=score：打分上限，默认 100 |
| max_votes | int | kind=vote：每人限票数 |
| allow_repeat | tinyint | kind=vote：可否重复投同一选手 |
| fixed_points | decimal(8,2) | kind=vote 固定分值模式：1票=N分；为空则归一模式 |
| restricted | tinyint | 1=限定名单（口令进入），0=开放扫码 |
| sort | int | 大屏切换顺序 |

### voters 记分成员（restricted 群体的评委/记分员）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| group_id | bigint FK | |
| name | varchar(64) | 评审姓名 |
| token | varchar(64) | 专属口令，/judge/{token} |
| need_bind | tinyint | 1=首次扫码需绑定微信（大众评审默认开） |
| bound_key | varchar(128) | 绑定标识：openid 或设备指纹，可空 |
| bound_at | datetime | 绑定时间，可空 |
| has_voted | tinyint | 提交后锁定 |
| voted_at | datetime | |

### score_entries 打分明细（kind=score）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| group_id / voter_id / contestant_id | bigint FK | |
| score | decimal(5,2) | 0~max_score |
| created_at | datetime | |

唯一约束：(group_id, voter_id, contestant_id)

### vote_entries 投票明细（kind=vote）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK | |
| group_id / contestant_id | bigint FK | |
| voter_key | varchar(128) | restricted 时为 voter_id；开放时为 openid/设备指纹 |
| ip | varchar(45) | |
| created_at | datetime | |

索引：(group_id, voter_key) 用于限票判断

### group_stats 群体×选手冗余统计
| 字段 | 类型 | 说明 |
|---|---|---|
| group_id | bigint FK | 联合主键 |
| contestant_id | bigint FK | 联合主键 |
| value_cache | decimal(10,2) | score=分数合计，vote=票数 |

**计分公式**（大屏与结果页只读本表+群体参与数，不扫明细）：

- score 群体：选手群体得分 = value_cache ÷ 已提交评委数（平均分）；贡献 = 平均分 × weight%
- vote 群体（归一）：贡献 = value_cache ÷ 群体参与人数 × weight
- vote 群体（固定分值）：贡献 = value_cache × fixed_points
- 轮次总分 = Σ 各群体贡献；聚合结果 = 多轮总分相加

## AI 模块（预留，M4 建表）

### ai_providers 服务商配置
provider（deepseek/volc/runninghub/liblib）、api_key、base_url、enabled、remark

### ai_tools 工具导航
title、category（ppt/image/voice/lipsync/digital-human）、description、sop（markdown 正文）、url、sort

## 待确认

- ~~观众限票的 voter_key 方案~~ 已定：投票上配置服务号（每次投票独立 AppID/Secret）→ 有配置走 openid 网页授权，无配置降级设备指纹+IP
