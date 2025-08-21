#!/bin/bash

# Supabase 数据库备份脚本 (纯 PostgreSQL 工具)
#
# 此脚本只备份数据库，不依赖 Supabase CLI
#
# 使用前，请通过 .env 文件或环境变量设置 DB_URL

set -e # 如果任何命令失败，立即退出

# --- 检查环境变量 ---
if [ -z "$DB_URL" ]; then
  echo "错误: 环境变量 DB_URL 未设置。" >&2
  exit 1
fi

# --- 主脚本 ---

echo "正在开始备份 Supabase 数据库..."

# 1. 创建本地备份目录
TIMESTAMP=$(date +%Y%m%d%H%M%S)
BACKUP_DIR="./supabase_backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
echo "备份文件将存储在: $BACKUP_DIR"

# 2. 备份数据库
PG_DUMP_CMD="/opt/homebrew/opt/postgresql@17/bin/pg_dump"

echo "正在备份数据库模式..."
$PG_DUMP_CMD "$DB_URL" --schema-only --no-owner --no-privileges > "$BACKUP_DIR/schema.sql"

echo "正在备份数据库数据..."
$PG_DUMP_CMD "$DB_URL" --data-only --no-owner --no-privileges > "$BACKUP_DIR/data.sql"

echo "正在创建完整备份..."
$PG_DUMP_CMD "$DB_URL" --no-owner --no-privileges > "$BACKUP_DIR/full_backup.sql"

echo "数据库备份完成！"
echo "备份文件:"
echo "- 模式: $BACKUP_DIR/schema.sql"
echo "- 数据: $BACKUP_DIR/data.sql" 
echo "- 完整: $BACKUP_DIR/full_backup.sql"
echo "---"
echo "备份目录: $BACKUP_DIR"
