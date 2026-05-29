# CLAUDE.md

## 项目概述

广西大学教务系统（正方教务系统）成绩监控脚本。定时抓取成绩数据，检测新成绩或成绩变动，通过邮件发送通知。

## 技术栈

- **运行时**: Node.js 26 + TypeScript
- **浏览器自动化**: Playwright — 密码在客户端 RSA 加密，必须用浏览器执行 JS 完成登录。使用 headless 模式
- **HTTP 客户端**: 浏览器 `fetch` API（复用 Playwright 登录后的 cookie 会话）
- **数据存储**: 本地 JSON 文件
- **邮件**: nodemailer
- **定时调度**: crontab（每次执行后进程退出，不常驻）
- **代码规范**: Prettier + ESLint（`@typescript-eslint`）+ TypeScript strict

## 项目结构

```
src/
  main.ts        # 主入口：登录 → 抓取 → 对比 → 通知
  test.ts        # 测试脚本：逐步执行并打印完整日志
  auth.ts        # 登录模块（Playwright）
  fetch.ts       # 成绩数据获取
  store.ts       # JSON 读写，增量检测
  notify.ts      # 邮件通知
  retry.ts       # 失败重试工具
  config.ts      # 配置管理（读取 .env）
  log.ts         # 日志工具（UTC+8 时间戳）
data/
  grades.json    # 历史成绩存储
```

## 关键发现

1. **登录无需验证码**（校园网 8:00-23:00 可直接登录）
2. **密码 RSA 加密**：登录页通过 `/jwglxt/xtgl/login_getPublicKey.html` 获取公钥，前端 JS 加密密码后提交。因此必须用 Playwright 而不能用纯 HTTP 请求
3. **成绩数据接口**: `POST /jwglxt/cjcx/cjcx_cxXsgrcj.html?gnmkdm=N305005&doType=query`
   - Content-Type: `application/x-www-form-urlencoded`
   - Body: `#searchForm` 表单字段（xnm, xqm, kcbjdm 等）
   - 响应: JSON `{ items: [...], totalResult: N }`
4. **成绩唯一标识**: `key` 字段 = `教学班ID-学号`
5. **成绩变动检测字段**: `bfzcj`（百分制成绩）、`cjbdsj`（成绩变动时间）

## 命令

```bash
pnpm start           # 执行一次抓取+检测+通知
pnpm test            # 测试模式：逐步执行并打印完整日志
pnpm run lint        # ESLint 检查
pnpm run format      # Prettier 格式化
pnpm run typecheck   # tsc 类型检查
pnpm run check       # 提交前检查（format check + lint + typecheck）
```

## 配置（.env）

```
GXU_STUDENT_ID=学号
GXU_PASSWORD=密码
# 邮件配置（后续添加）
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
NOTIFY_EMAIL=
```

## 编码规范

- TypeScript strict 模式
- ESM 模块（`"type": "module"`）
- 无注释（命名自解释），除非逻辑不显而易见
- 不使用 emoji（包括注释、commit message、文档）
- 单文件职责单一，不超过 150 行
- 不做过度抽象：三个类似的行胜过一个不成熟的抽象
- 仅处理真实存在的错误场景，不防御不可能的情况

提交前必须通过 `pnpm run check`（prettier 格式检查 + eslint + tsc 类型检查）。

## Commit 规范

- 格式：`type: 中文描述`（如 `feat: 添加成绩抓取模块`、`fix: 修复登录失败问题`）
- 中文描述简练，一句话说清改动目的
- 结尾附带 `Co-authored-by: Claude <noreply@anthropic.com>`
