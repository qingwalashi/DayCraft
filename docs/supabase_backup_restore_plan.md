# Supabase 本地备份与恢复方案

本文档提供了将 Supabase 项目**数据库**备份到本地电脑，并从本地备份进行恢复的详细步骤。

**注意**：此方案仅涵盖数据库，不包括 Supabase Storage 中的文件。

## 核心工具

- **PostgreSQL 客户端工具 (`pg_dump`, `psql`)**: 用于备份和恢复数据库。

**注意**: 此方案不依赖 Supabase CLI，只需要 PostgreSQL 客户端工具即可。

### 安装 PostgreSQL 客户端工具

如果您尚未安装 PostgreSQL 客户端工具，可以通过以下方式安装：

**macOS (使用 Homebrew):**
```bash
brew install postgresql@17
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-client
```

**Windows:**
下载并安装 PostgreSQL 或使用 `winget install PostgreSQL.PostgreSQL`

---

## 备份方案（到本地电脑）

现在，您可以使用简化的 `scripts/backup.sh` 脚本来备份数据库，无需 Supabase CLI。

### 第 1 步：准备工作

1.  **设置数据库连接字符串**
    为了安全起见，`DB_URL` 不应直接写在脚本中。推荐使用以下方法之一进行配置：

    **方法一：使用 `.env` 文件 (推荐)**
    我们提供了一个示例文件 `.env.example`。您可以复制它来创建自己的 `.env` 文件：
    ```bash
    cp .env.example .env
    ```
    然后，打开 `.env` 文件并填入您的 `DB_URL`。
    **重要提示**：请务必将 `.env` 文件添加到 `.gitignore` 中，以防止将敏感信息提交到版本库。
    
    然后在运行脚本前，先加载环境变量：
    ```bash
    source .env
    ./scripts/backup.sh
    ```

    **方法二：直接在终端设置环境变量**
    ```bash
    export DB_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
    ```
    请务必将 `[YOUR-PASSWORD]` 和 `[PROJECT_REF]` 替换为您的实际信息。

2.  **为脚本添加执行权限**
    ```bash
    chmod +x scripts/backup.sh
    ```

### 第 2 步：执行备份

直接运行脚本即可，无需登录 Supabase CLI：

```bash
./scripts/backup.sh
```

脚本将创建一个带时间戳的目录（例如 `supabase_backups/20250821235000/`），并生成三种备份文件：
- `schema.sql`: 仅包含数据库的表结构、视图、函数等定义。
- `data.sql`: 仅包含数据。
- `full_backup.sql`: 包含结构和数据的完整备份。

**为什么需要多种备份文件？**
- **灵活性**：分离的 `schema.sql` 和 `data.sql` 文件允许您在需要时只恢复数据库结构或只恢复数据。
- **可靠性**：`full_backup.sql` 是最可靠的恢复方式。恢复脚本优先使用此文件。当使用分离文件恢复时，脚本内置了特殊处理（如临时禁用触发器）来解决潜在的循环外键依赖问题，确保恢复过程的顺利进行。

---

## 恢复方案（从本地电脑）

您可以使用简化的 `scripts/restore.sh` 脚本来从本地备份恢复数据库，无需 Supabase CLI。

### 第 1 步：准备工作

1.  **设置数据库连接字符串**
    和备份一样，请确保 `DB_URL` 环境变量已通过 `.env` 文件或在终端中正确设置。

2.  **为脚本添加执行权限**
    ```bash
    chmod +x scripts/restore.sh
    ```

### 第 2 步：执行恢复

运行恢复脚本时，需要将备份目录的路径作为参数传递：

```bash
./scripts/restore.sh ./supabase_backups/20250821235000/
```

脚本会自动检测备份文件类型：
- 如果存在 `full_backup.sql`，将使用完整备份恢复
- 否则使用 `schema.sql` 和 `data.sql` 分别恢复结构和数据

---

## 自动化建议

您可以使用 `cron` 作业（在 macOS/Linux）或任务计划程序（在 Windows）来定期执行本地备份脚本，确保您的数据得到持续保护。
