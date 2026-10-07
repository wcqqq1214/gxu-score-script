# 广西大学教务信息抓取脚本

定时抓取广西大学教务系统的成绩和最新学期考试安排，检测新增与变动，通过邮件通知。基于 TypeScript + Playwright，每次执行后退出。

## 快速开始

需要 Node.js >= 22 和 pnpm >= 9。

```bash
git clone https://github.com/wcqqq1214/gxu-score-script.git
cd gxu-score-script
pnpm install
pnpm exec playwright install chromium
# Linux 使用以下命令安装浏览器及系统依赖
# pnpm exec playwright install --with-deps chromium

cp .env.example .env
```

编辑 `.env`：

```env
GXU_STUDENT_ID=你的学号
GXU_PASSWORD=你的密码
SMTP_HOST=你的SMTP地址
SMTP_PORT=465
SMTP_USER=你的邮箱
SMTP_PASS=你的授权码
NOTIFY_EMAIL=接收通知的邮箱
LOG_LEVEL=info
```

SMTP 配置可选，不配置则仅在控制台输出通知。465 端口使用隐式 TLS，其他端口必须支持 STARTTLS。配置完成后运行 `pnpm start`；排查抓取问题可用 `pnpm test`，打印详细日志但不保存数据。

历史数据保存在 `data/grades.json` 和 `data/exams.json`。首次运行只建立基线，不发送旧数据通知；更新或迁移时保留 `data/`。

## 服务器部署

适用于支持 cgroup v2 的 Linux systemd 主机。先完成上面的安装和配置，默认项目位于 `/root/gxu-score-script`，Node 位于 `/usr/bin/node`；路径不同时修改 [service 文件](deploy/gxu-score.service) 中的 `WorkingDirectory` 和 `ExecStart`。

如果之前使用 cron，先通过 `crontab -e` 删除本项目的旧任务，并等待正在运行的抓取结束，再启用 timer。

```bash
cd /root/gxu-score-script
sudo install -m 644 deploy/gxu-score.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gxu-score.timer
systemctl list-timers gxu-score.timer
```

每天按北京时间 **08:00–21:30，每 30 分钟**执行一次，不补跑关机期间错过的任务。任务不会重叠运行，最长运行 10 分钟，终止后最多等待 15 秒再强制清理所有子进程。

默认限制整个任务内存 512 MiB、CPU 为一个逻辑核的算力、进程和线程合计 128 个。可根据实际峰值和服务器余量在 service 文件中调整。

常用管理命令：

```bash
# 手动执行（可能更新数据并发送邮件）
sudo systemctl start gxu-score.service

# 查看日志和退出状态
journalctl -u gxu-score.service --since today --no-pager
systemctl status gxu-score.service

# 暂停调度，并停止当前任务
sudo systemctl stop gxu-score.timer gxu-score.service
```

生产环境手动执行也使用 `systemctl start`，以保留防重叠和资源限制。更新 unit 文件后，重新执行安装和 `daemon-reload` 命令，再运行 `sudo systemctl restart gxu-score.timer`。

## 开发与验证

```bash
pnpm run check     # 格式、ESLint、TypeScript 检查
pnpm run format    # 格式化源码
node --import tsx/esm --test tests/*.test.mjs

# Linux：使用独立 service 和真实 Chromium 验证完成、失败、超时及防重叠
sudo python3 tests/verify-systemd.py
```

离线测试使用模拟教务页面和本地 SMTP，不访问学校、不发送真实邮件、不修改生产数据；SMTP 测试需要系统提供 `openssl`。真实抓取使用 `pnpm test`，需在教务系统开放时段执行，配置 SMTP 时会发送测试邮件。`LOG_LEVEL=debug` 会打印成绩与考试明细。

## 许可

MIT License
