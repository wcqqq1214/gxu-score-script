# GXU 成绩抓取脚本

定时抓取广西大学教务系统（正方教务系统）成绩数据，检测新成绩或成绩变动，通过邮件发送通知。基于 Playwright + TypeScript，通过 GitHub Actions 定时执行。

## 快速开始

```bash
# 克隆仓库
git clone <repo-url>
cd gxu-score-script

# 安装依赖 & Playwright 浏览器
pnpm install
pnpm exec playwright install chromium

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写学号和密码

# 测试运行
pnpm test

# 正式运行
pnpm start
```

## 配置

创建 `.env` 文件：

```env
GXU_STUDENT_ID=你的学号
GXU_PASSWORD=你的密码
SMTP_HOST=你的SMTP地址
SMTP_PORT=465
SMTP_USER=你的邮箱
SMTP_PASS=你的授权码
NOTIFY_EMAIL=接收通知的邮箱
```

SMTP 配置可选，不配置则仅在控制台输出通知。

## 命令

```bash
pnpm start        # 执行抓取、对比、通知
pnpm test         # 测试模式：完整日志、不存数据
pnpm run lint     # ESLint 检查
pnpm run format   # Prettier 格式化
pnpm run typecheck # tsc 类型检查
pnpm run check    # 提交前完整检查
```

## GitHub Actions

在仓库 Settings → Secrets → Actions 中配置上述环境变量，推送代码后自动每 30 分钟执行一次（UTC+8 8:00-23:00）。

成绩数据存储在 `data/grades.json`，每次运行后自动 commit 回仓库。

## 技术栈

TypeScript + Playwright + NodeMailer + GitHub Actions
