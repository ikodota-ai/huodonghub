#!/usr/bin/env bash
# 每日备份：数据库 + 媒体文件，保留最近 14 天
# crontab 示例：15 3 * * * /www/huodongpeitai/scripts/backup.sh >> /www/huodongpeitai/media/backups/cron.log 2>&1
set -euo pipefail

# 宝塔/cron 环境 PATH 精简，前置常见 MySQL 路径（宝塔:/www/server/mysql/bin）
export PATH="/www/server/mysql/bin:/usr/local/mysql/bin:/usr/local/bin:$PATH"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

# 从 .env 读 DATABASE_URL 与 MEDIA_ROOT
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d'"' -f2)"
MEDIA_ROOT="$(grep -E '^MEDIA_ROOT=' "$ENV_FILE" | cut -d'"' -f2 || true)"
MEDIA_ROOT="${MEDIA_ROOT:-./media}"
[[ "$MEDIA_ROOT" = /* ]] || MEDIA_ROOT="$APP_DIR/${MEDIA_ROOT#./}"

# 解析 mysql://user:pass@host:port/db
proto_removed="${DATABASE_URL#mysql://}"
userpass="${proto_removed%%@*}"
hostpath="${proto_removed#*@}"
DB_USER="${userpass%%:*}"
DB_PASS="${userpass#*:}"
DB_HOST="${hostpath%%:*}"
port_db="${hostpath#*:}"
DB_PORT="${port_db%%/*}"
DB_NAME="${port_db#*/}"

BACKUP_DIR="$MEDIA_ROOT/backups"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"

echo "[$(date '+%F %T')] 开始备份 → $BACKUP_DIR"

# 1. 数据库
MYSQL_PWD="$DB_PASS" mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" "$DB_NAME" \
  --single-transaction --default-character-set=utf8mb4 \
  --result-file="$BACKUP_DIR/db_$STAMP.sql"
gzip "$BACKUP_DIR/db_$STAMP.sql"

# 2. 媒体文件（排除备份自身与临时目录）
tar -czf "$BACKUP_DIR/media_$STAMP.tar.gz" -C "$MEDIA_ROOT" \
  --exclude=backups --exclude=tmp .

# 3. 清理 14 天前的备份
find "$BACKUP_DIR" -name 'db_*.sql.gz' -mtime +14 -delete
find "$BACKUP_DIR" -name 'media_*.tar.gz' -mtime +14 -delete

# 4. 记录最近备份时间（供后台"系统设置"展示）
MYSQL_PWD="$DB_PASS" mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" "$DB_NAME" -e \
  "INSERT INTO settings (\`key\`, \`value\`) VALUES ('backup.last', '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)') ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`);" \
  2>/dev/null || echo "（settings 写入失败，不影响备份本身）"

echo "[$(date '+%F %T')] 完成：db_$STAMP.sql.gz / media_$STAMP.tar.gz"
