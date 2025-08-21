#!/bin/bash

# Supabase 数据库恢复脚本 (纯 PostgreSQL 工具)
#
# 此脚本只恢复数据库，不依赖 Supabase CLI
#
# 使用前，请通过 .env 文件或环境变量设置 DB_URL

set -e # 如果任何命令失败，立即退出

# --- 检查环境变量 ---
if [ -z "$DB_URL" ]; then
  echo "错误: 环境变量 DB_URL 未设置。" >&2
  exit 1
fi

# --- 主脚本 ---

if [ -z "$1" ]; then
  echo "错误: 请提供备份目录的路径作为第一个参数。" >&2
  echo "用法: ./scripts/restore.sh /path/to/your/backup_dir" >&2
  exit 1
fi

RESTORE_DIR=$1

if [ ! -d "$RESTORE_DIR" ]; then
    echo "错误: 目录 '$RESTORE_DIR' 不存在。" >&2
    exit 1
fi

# --- 主脚本 ---

echo "正在从目录 '$RESTORE_DIR' 恢复 Supabase 数据库..."

# 检查备份文件是否存在
PSQL_CMD="/opt/homebrew/opt/postgresql@17/bin/psql"

if [ -f "$RESTORE_DIR/full_backup.sql" ]; then
    echo "发现完整备份文件，正在恢复..."
    $PSQL_CMD "$DB_URL" -f "$RESTORE_DIR/full_backup.sql"
    echo "数据库恢复完成！"
elif [ -f "$RESTORE_DIR/schema.sql" ] && [ -f "$RESTORE_DIR/data.sql" ]; then
    echo "发现分离的模式和数据文件，正在恢复..."
    echo "- 正在恢复模式..."
    $PSQL_CMD "$DB_URL" -f "$RESTORE_DIR/schema.sql"
    echo "- 正在恢复数据 (临时禁用触发器)..."
    (echo "SET session_replication_role = 'replica';" && cat "$RESTORE_DIR/data.sql" && echo "SET session_replication_role = 'origin';") | $PSQL_CMD "$DB_URL" > /dev/null
    echo "数据库恢复完成！"
else
    echo "错误: 在 '$RESTORE_DIR' 中未找到有效的备份文件。" >&2
    echo "需要以下文件之一:" >&2
    echo "- full_backup.sql (完整备份)" >&2
    echo "- schema.sql 和 data.sql (分离备份)" >&2
    exit 1
fi

echo "---"
echo "数据库恢复操作已成功完成！"
