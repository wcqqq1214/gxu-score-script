# AGENTS.md

## Task execution

- Treat an implementation or artifact request as authorization for the necessary work within that scope; review-only requests remain read-only. Continue through the deliverable and relevant verification.
- Reuse the conversation, project evidence, and prior decisions before asking. Resolve routine, reversible choices yourself. Ask only when a missing fact materially affects correctness, scope, or an action's authorization and cannot reasonably be inferred.
- An explicit request for an action already authorizes that action within its stated target and scope; do not request the same approval at each step. Honor explicit user checkpoints and runtime permissions. Progress notices and agent checks do not require a reply; silence is not approval.
- Prepare authorized work before requesting any still-missing approval. A blocker pauses only dependent steps; continue useful independent work. If a Skill causes a pause, identify its exact file and rule and explain why it applies.
- Use Skills for their relevant domain guidance. User instructions take precedence over Skill guidelines, subject to higher-priority instructions. Do not add a spec, dependency, review round, worktree, test suite, or external action merely because a template lists it.
- Match implementation and validation to the actual risk. When required checks pass and the requested outcome is met, deliver it. If blocked after meaningful diagnosis and feasible alternatives, report completed work, remaining work, evidence, and the minimum input needed; do not call partial work complete or retry unchanged failures indefinitely.

## 项目概述

广西大学教务系统（正方教务系统）成绩与考试安排监控脚本。定时抓取成绩数据和最新学期考试安排，检测新成绩、成绩变动、新考试安排或考试安排变动，通过邮件发送通知。

## 技术栈

- **运行时**: Node.js >= 22 + TypeScript
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
  exam.ts        # 考试安排获取
  store.ts       # JSON 读写，增量检测
  notify.ts      # 邮件通知
  retry.ts       # 失败重试工具
  config.ts      # 配置管理（读取 .env）
  log.ts         # 日志工具（UTC+8 时间戳）
data/
  grades.json    # 历史成绩存储
  exams.json     # 最新学期考试安排存储
```

## 关键发现

1. **登录无需验证码**（校园网 8:00-23:00 可直接登录）
2. **密码 RSA 加密**：登录页通过 `/jwglxt/xtgl/login_getPublicKey.html` 获取公钥，前端 JS 加密密码后提交。因此必须用 Playwright 而不能用纯 HTTP 请求
3. **成绩数据接口**: `POST /jwglxt/cjcx/cjcx_cxXsgrcj.html?gnmkdm=N305005&doType=query`
   - Content-Type: `application/x-www-form-urlencoded`
   - Body: `#searchForm` 表单字段（xnm, xqm, kcbjdm 等）
   - 响应: JSON `{ items: [...], totalResult: N }`
4. **考试安排接口**: `POST /jwglxt/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105`
   - 同样复用 `#searchForm` 表单字段（xnm, xqm 等）
   - 响应: JSON `{ items: [...], totalResult: N }`
5. **成绩唯一标识**: `key` 字段 = `教学班ID-学号`
6. **成绩变动检测字段**: `bfzcj`（百分制成绩）、`cjbdsj`（成绩变动时间）
7. **教务系统 22:00 后不可用**：服务器夜间维护/关机，crontab 时间窗口需控制在 8:00-22:00
8. **OOM 防护**: Playwright 每次 `chromium.launch()` 必须对应 `browser.close()`，否则内存泄漏
   - 浏览器启动添加 `--no-sandbox --disable-dev-shm-usage --disable-gpu` 等省内存参数
   - Node.js 通过 `--max-old-space-size=512` 限制堆内存
   - 清理残留进程时先核对本任务启动的 PID/进程组，只终止本任务拥有的进程；不要以宽泛名称匹配杀掉其他浏览器会话。

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
# 邮件配置（可选，不配置则仅在控制台输出通知）
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
NOTIFY_EMAIL=
LOG_LEVEL=info # debug/info/warn/error，默认 info
```

## 编码规范

- TypeScript strict 模式
- ESM 模块（`"type": "module"`）
- 无注释（命名自解释），除非逻辑不显而易见
- 不使用 emoji（包括注释、commit message、文档）
- 单文件保持职责内聚；只有拆分能改善理解、复用或测试时才拆分，不用 150 行作为硬门槛。
- 不做过度抽象：三个类似的行胜过一个不成熟的抽象
- 仅处理真实存在的错误场景，不防御不可能的情况

代码或构建配置修改在提交前必须通过 `pnpm run check`（prettier 格式检查 + eslint + tsc 类型检查）；纯文档修改检查对应格式、链接和指令一致性。`pnpm start` 包含真实抓取和邮件通知，不作为普通代码修改的默认验证；只有本次任务已授权这些外部动作才运行。

## Commit 规范

- 格式：`type: 中文描述`（如 `feat: 添加成绩抓取模块`、`fix: 修复登录失败问题`）
- 中文描述简练，一句话说清改动目的
- 结尾附带 `Co-authored-by: Codex <noreply@openai.com>`
