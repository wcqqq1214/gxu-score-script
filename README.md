# 广西大学教务信息抓取脚本

定时抓取广西大学教务系统（正方教务系统）成绩数据和最新学期考试安排，检测新成绩、成绩变动、新考试安排或考试安排变动，通过邮件发送通知。基于 Playwright + TypeScript，通过 systemd timer 定时执行，每次任务结束后退出。

## 前置依赖

- Node.js >= 22
- pnpm >= 9
- Playwright Chromium（使用下方命令安装）

```bash
# macOS
brew install node pnpm

# Linux (Debian/Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
corepack enable
corepack prepare pnpm@latest --activate

# 验证
node -v
pnpm -v
```

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/wcqqq1214/gxu-score-script.git
cd gxu-score-script

# 安装依赖 & Playwright 浏览器
pnpm install
pnpm exec playwright install chromium

# Linux 需要安装系统依赖
npx playwright install-deps

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
LOG_LEVEL=日志等级: debug/info/warn/error，默认 info
```

SMTP 配置可选，不配置则仅在控制台输出通知。`LOG_LEVEL=debug` 会额外打印每条成绩/考试明细，适合排查问题。

## 命令

```bash
pnpm start         # 执行成绩和考试信息抓取、对比、通知
pnpm test          # 测试模式：完整日志、不存数据
pnpm run lint      # ESLint 检查
pnpm run format    # Prettier 格式化
pnpm run typecheck # tsc 类型检查
pnpm run check     # 提交前完整检查
```

成绩历史保存到 `data/grades.json`，最新学期考试安排历史保存到 `data/exams.json`。首次生成对应历史文件时只保存数据，不发送旧数据通知。

## 服务器部署与定时执行

使用 `deploy/gxu-score.service` 和 `deploy/gxu-score.timer`，适用于支持 cgroup v2 的 Linux systemd 主机。默认部署路径为 `/root/gxu-score-script`、Node 路径为 `/usr/bin/node`；其他机器先修改 service 中的 `WorkingDirectory` 和 `ExecStart`。`.env` 由 Node 从工作目录读取，保留现有 `data/`，避免重新建立通知基线。

定时器每天按 **Asia/Shanghai 时区 08:00–21:30，每 30 分钟**启动一次。22:00 后不启动；`Persistent=false` 表示关机期间错过的任务不会在夜间开机时补跑。同一 service 正在运行时，重复启动不会创建并发实例。生产环境手动执行也使用 `systemctl start`，直接运行 `pnpm start` 会绕过 systemd 的防重叠和资源限制。

首次迁移前编辑 crontab，删除旧的成绩监控整行任务（包括其中按名称杀 Chromium 的命令），保留其他业务任务。不要同时保留 cron 和 timer，也不要使用全局 `pkill` 清理浏览器。迁移时确认旧抓取已结束；若必须终止，先核对 PID 和进程归属。

```bash
cd /root/gxu-score-script
crontab -e

sudo install -m 644 deploy/gxu-score.service /etc/systemd/system/gxu-score.service
sudo install -m 644 deploy/gxu-score.timer /etc/systemd/system/gxu-score.timer
sudo systemd-analyze verify /etc/systemd/system/gxu-score.service /etc/systemd/system/gxu-score.timer
sudo systemctl daemon-reload
sudo systemctl enable --now gxu-score.timer
systemctl list-timers gxu-score.timer
```

后续更新代码后重新安装有变化的 unit 文件并运行 `systemctl daemon-reload`；timer 有变化时再运行 `systemctl restart gxu-score.timer`。

### 超时、清理与资源额度

- 浏览器启动上限 60 秒；页面操作、成绩与考试接口请求上限 30 秒（含响应体读取）。失败最多尝试 3 次，每次间隔 5 秒。
- 结束时直接关闭整个浏览器，覆盖其页面和上下文。登录失败先关闭浏览器再重试；关闭失败则停止重试。收到 SIGTERM/SIGINT 后停止重试，Playwright 尝试关闭浏览器。
- service 使用 `Type=oneshot` 和 `TimeoutStartSec=10min` 限制整次任务；超时发送 SIGTERM，15 秒后仍未结束则 SIGKILL。`KillMode=control-group` 清理 Node、Chromium 及同组子进程。oneshot 不能用 `RuntimeMaxSec` 替代启动超时。
- 默认 `MemoryHigh=384M`、`MemoryMax=512M`、`MemorySwapMax=64M`，限制整个任务；Node 的 V8 堆另限 256 MiB。`CPUQuota=100%` 表示最多一个逻辑 CPU 的算力，`TasksMax=128` 包含进程和线程。这些是部署初始额度，应结合该服务器实测峰值和其他业务余量调整。
- 不自动无限重启失败任务；本次失败结束后等下一个定时周期。

```bash
# 手动执行生产任务：可能更新数据并发送通知
sudo systemctl start gxu-score.service

# 日志与退出原因，异常时结合 systemd 的 Result 判断
journalctl -u gxu-score.service --since today --no-pager
systemctl show gxu-score.service -p Result -p ExecMainCode -p ExecMainStatus

# 运行期间查看整个资源组
systemctl show gxu-score.service -p ControlGroup -p MemoryCurrent -p TasksCurrent -p CPUUsageNSec
systemd-cgls /system.slice/gxu-score.service

# 暂停调度；必要时正常停止当前任务
sudo systemctl stop gxu-score.timer
sudo systemctl stop gxu-score.service
```

应用日志带北京时间、运行 ID、阶段、开始/结束、耗时、重试总数和退出原因，不打印学号或凭据。systemd 的 invocation ID 与应用运行 ID 一致。SIGKILL 时应用无法写结束日志，应以 journal 中的超时/OOM/退出记录为准。旧 `/var/log/gxu-score.log` 保留，新日志写入 journal。timer 合并重复启动不额外生成“跳过”应用日志；十分钟总时限短于三十分钟间隔，异常运行通过 service 失败记录定位。

### 离线验证

```bash
pnpm run check
node --import tsx/esm --test tests/lifecycle.test.mjs

# 使用真实 Chromium 和拦截的模拟教务页面，不访问学校、不发邮件、不改生产 data/
node --import tsx/esm tests/fixture.mjs success
node --import tsx/esm tests/fixture.mjs login-failure
node --import tsx/esm tests/fixture.mjs request-timeout

# Linux 服务器：独立测试 service，串行验证上述场景、SIGTERM、SIGKILL 与防重叠
sudo python3 tests/verify-systemd.py
```

后两种场景预期以非零状态退出。`tests/fixture.mjs hang` 用于独立测试 service 的超时验证：替换测试 unit 的 `ExecStart` 并缩短 `TimeoutStartSec`，确认重复 start 不改变 MainPID、超时后 cgroup 无残留进程；不要改生产 service 来注入故障。模拟成功只能验证代码流程和资源释放，学校网络与真实账号的端到端成功仍需在开放时段确认。

### 本次部署验证（2026-10-08）

在现有 Ubuntu 22.04 / systemd 249 / Node 22.22.2 / Playwright 1.60.0 服务器上，使用真实 Chromium、模拟教务页面和独立测试 service 完成验证：

| 场景             | 结果                                | 采样内存峰值 | 进程/线程峰值 |
| ---------------- | ----------------------------------- | ------------ | ------------- |
| 正常完成         | 退出码 0                            | 377.4 MiB    | 70            |
| 登录失败         | 三次尝试均释放浏览器，退出码 1      | 346.1 MiB    | 66            |
| 接口无响应       | 请求超时，退出码 1                  | 303.5 MiB    | 67            |
| 整次任务超时     | SIGTERM 正常结束，退出码 143        | 291.7 MiB    | 67            |
| 事件循环完全阻塞 | 20 秒测试时限 + 15 秒宽限后 SIGKILL | 363.2 MiB    | 64            |

五种场景均验证重复启动不创建新实例、结束后资源组和已记录 PID 无残留。内存按整个 cgroup 每约 200 毫秒采样，可能遗漏瞬时峰值；512 MiB 硬上限相对本次最大采样值约有 36% 余量，真实教务页面仍需白天观察。正常生产任务保留十分钟时限。生产 `.env` 与历史 JSON 未更改。

## 技术栈

TypeScript + Playwright + NodeMailer + systemd

## 许可

MIT License
