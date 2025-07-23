# DayCraft - 智能日报管理系统

<div align="center">
  <img src="public/icons/icon-512x512.png" alt="DayCraft Logo" width="120" height="120" />
  <h3>高效记录工作，智能生成报告</h3>
  <p>基于 Next.js 14 和 Supabase 构建的现代化日报管理平台</p>
</div>

## 📋 项目概述

DayCraft 是一个专为职场人士设计的智能日报管理系统，帮助用户高效记录日常工作内容，并自动生成周报和月报。系统集成了 AI 辅助功能，可以润色和优化报告内容，让工作汇报更加专业高效。此外，系统还提供了完整的项目管理、待办任务管理、工作分解结构（WBS）、甘特图和里程碑时间线等功能，是一个全方位的工作管理平台。

### ✨ 核心特性

#### 📝 日报与报告管理
- **智能日报**：按项目分类记录工作内容，支持工作计划和实际工作记录
- **自动周报月报**：基于日报内容自动生成周报和月报，节省汇总时间
- **项目周报**：专门的项目维度周报生成和管理
- **AI 辅助润色**：使用 AI 技术优化报告内容，使表达更加专业清晰
- **一键复制到钉钉**：支持 iOS 设备一键复制日报到钉钉应用

#### 📊 项目管理
- **项目创建与管理**：创建、编辑和删除项目，支持项目状态管理
- **工作分解结构（WBS）**：可视化项目工作分解，支持拖拽排序
- **甘特图**：直观展示项目进度和时间线
- **里程碑时间线**：重要节点和里程碑的时间线管理
- **进度跟踪**：实时跟踪项目进度和完成情况

#### ✅ 待办任务管理
- **智能待办**：创建和跟踪项目待办事项，支持优先级（高/中/低）和截止日期
- **状态管理**：待办状态跟踪（未开始/进行中/已完成）
- **项目分组**：按项目筛选和分组显示待办事项
- **数量限制**：每个项目的未开始和进行中待办数量限制（最多10个）
- **概览展示**：在概览页面显示待办计划，并标记进行中的任务

#### 🎨 用户体验
- **现代化界面**：采用 Tailwind CSS 和 Shadcn UI 的精美设计
- **响应式设计**：完美适配桌面和移动设备
- **PWA 支持**：支持作为渐进式 Web 应用安装到桌面和移动设备
- **离线功能**：支持离线访问和数据同步
- **主题切换**：支持明暗主题切换

#### 🔒 安全与性能
- **数据安全**：基于 Supabase 的行级安全策略（RLS），确保数据安全
- **用户认证**：完整的用户注册、登录、密码重置功能
- **角色管理**：支持普通用户和管理员角色
- **性能优化**：页面可见性监听，智能数据加载和缓存

## 🚀 快速开始

### 前置条件

- Node.js 18.x 或更高版本
- npm 或 yarn 包管理器
- Supabase 账户

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/yourusername/daycraft.git
cd daycraft
```

2. 安装依赖

```bash
npm install
# 或
yarn install
```

3. 配置环境变量

复制 `.env.example` 文件并重命名为 `.env`，然后填入你的 Supabase 配置信息：

```bash
cp .env.example .env
```

4. 初始化数据库

在 Supabase 控制台中运行 `sql/create_tables.sql` 文件中的 SQL 语句，创建所需的表结构。

5. 启动开发服务器

```bash
npm run dev
# 或
yarn dev
```

应用将在 [http://localhost:3000](http://localhost:3000) 启动。

## 🚀 部署指南

### Vercel 部署（推荐）

1. **连接 GitHub 仓库**
   ```bash
   # 推送代码到 GitHub
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **在 Vercel 中导入项目**
   - 访问 [Vercel Dashboard](https://vercel.com/dashboard)
   - 点击 "New Project"
   - 导入你的 GitHub 仓库

3. **配置环境变量**
   在 Vercel 项目设置中添加以下环境变量：
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **部署完成**
   - Vercel 会自动构建和部署应用
   - 每次推送到 main 分支都会触发自动部署

### 其他部署平台

#### Netlify
1. 连接 GitHub 仓库
2. 设置构建命令：`npm run build`
3. 设置发布目录：`.next`
4. 配置环境变量

#### 自托管
1. 构建生产版本：`npm run build`
2. 启动生产服务器：`npm start`
3. 使用 PM2 或其他进程管理器保持应用运行

## 🔧 技术架构

### 前端技术栈
- **框架**: Next.js 14 (App Router) - 现代化的 React 全栈框架
- **UI 组件库**:
  - Tailwind CSS - 原子化 CSS 框架
  - Shadcn UI - 高质量的 React 组件库
  - Radix UI - 无障碍的底层 UI 组件
- **状态管理**:
  - React Context API - 全局状态管理
  - Zustand - 轻量级状态管理
- **表单处理**: React Hook Form + Zod 验证
- **图表可视化**:
  - ApexCharts - 数据图表
  - React Flow - 流程图和甘特图
- **拖拽功能**: @dnd-kit - 现代化拖拽库
- **日期处理**: date-fns + date-fns-tz
- **文件处理**:
  - JSZip - 文件压缩
  - file-saver - 文件下载
  - XLSX - Excel 文件处理

### 后端与数据
- **数据库**: Supabase PostgreSQL - 现代化的 BaaS 平台
- **认证系统**: Supabase Auth - 完整的用户认证解决方案
- **实时功能**: Supabase Realtime - 实时数据同步
- **文件存储**: Supabase Storage - 文件上传和管理
- **API**: Next.js API Routes - 服务端 API 接口

### 开发工具
- **语言**: TypeScript - 类型安全的 JavaScript
- **代码规范**: ESLint + TypeScript ESLint
- **样式**: PostCSS + Autoprefixer
- **PWA**: next-pwa - 渐进式 Web 应用支持
- **通知**: Sonner - 优雅的通知组件
- **AI 集成**: 支持 OpenAI / Anthropic / DeepSeek API

## 📁 项目结构

```
DayCraft/
├── app/                          # Next.js 14 App Router 目录
│   ├── (auth)/                   # 认证相关页面组
│   │   ├── auth/                 # 统一认证页面
│   │   ├── login/                # 登录页面
│   │   ├── signup/               # 注册页面
│   │   ├── forgot-password/      # 忘记密码
│   │   └── reset-password/       # 重置密码
│   ├── api/                      # API 路由
│   │   ├── projects/             # 项目相关 API
│   │   ├── share/                # 分享功能 API
│   │   └── work-breakdown/       # 工作分解 API
│   ├── dashboard/                # 主要功能页面
│   │   ├── overview/             # 概览仪表盘
│   │   ├── projects/             # 项目管理
│   │   ├── daily-reports/        # 日报管理
│   │   ├── reports/              # 周报月报
│   │   ├── project-reports/      # 项目周报
│   │   ├── todos/                # 待办管理
│   │   ├── work-breakdown/       # 工作分解结构
│   │   ├── settings/             # 系统设置
│   │   └── admin/                # 管理员功能
│   ├── share/                    # 公开分享页面
│   ├── _offline/                 # PWA 离线页面
│   ├── globals.css               # 全局样式
│   ├── layout.tsx                # 根布局
│   ├── layout-client.tsx         # 客户端布局
│   ├── page.tsx                  # 首页
│   └── manifest.ts               # PWA 清单
├── components/                   # 可复用组件
│   ├── dashboard/                # 仪表盘组件
│   ├── gantt/                    # 甘特图组件
│   ├── milestone/                # 里程碑组件
│   ├── project-reports/          # 项目报告组件
│   ├── work-breakdown/           # 工作分解组件
│   └── ui/                       # 基础 UI 组件
├── contexts/                     # React Context
│   └── auth-context.tsx          # 认证上下文
├── lib/                          # 工具库
│   ├── hooks/                    # 自定义 Hooks
│   ├── services/                 # 业务服务
│   ├── store/                    # 状态管理
│   ├── supabase/                 # Supabase 配置
│   ├── utils/                    # 工具函数
│   └── validators/               # 数据验证
├── providers/                    # 全局 Provider
│   └── theme-provider.tsx        # 主题提供者
├── public/                       # 静态资源
│   ├── icons/                    # PWA 图标
│   └── favicon.ico               # 网站图标
├── sql/                          # 数据库脚本
│   └── create_tables.sql         # 数据库表结构
├── scripts/                      # 脚本文件
│   └── check-tables.js           # 数据库检查脚本
├── docs/                         # 文档目录
├── package.json                  # 项目依赖
├── tsconfig.json                 # TypeScript 配置
├── tailwind.config.cjs           # Tailwind CSS 配置
├── postcss.config.cjs            # PostCSS 配置
├── next.config.cjs               # Next.js 配置
├── eslint.config.mjs             # ESLint 配置
└── middleware.ts                 # Next.js 中间件
```

## 🙏 致谢

感谢以下开源项目和服务：

- [Next.js](https://nextjs.org/) - React 全栈框架
- [Supabase](https://supabase.com/) - 开源的 Firebase 替代方案
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS 框架
- [Shadcn UI](https://ui.shadcn.com/) - 高质量的 React 组件库
- [Radix UI](https://www.radix-ui.com/) - 无障碍的 UI 组件
- [Lucide React](https://lucide.dev/) - 美观的图标库
