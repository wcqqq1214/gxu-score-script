import { loadConfig } from "./config.js";
import { login } from "./auth.js";
import { fetchGrades } from "./fetch.js";
import { loadStore, detectChanges } from "./store.js";
import { notify } from "./notify.js";
import { retry } from "./retry.js";

function log(step: string, ...args: unknown[]) {
  const now = new Date();
  const ts = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${ts}] [${step}]`, ...args);
}

async function main() {
  log("config", "加载配置...");
  const config = loadConfig();
  log("config", `学号: ${config.studentId}`);

  log("auth", "登录中...");
  const page = await retry(() => login(config.studentId, config.password), {
    onRetry: (attempt, err) => log("auth", `重试 ${attempt}/2: ${String(err)}`),
  });
  log("auth", "登录成功");

  try {
    log("fetch", "抓取成绩...");
    const grades = await retry(() => fetchGrades(page), {
      onRetry: (attempt, err) => log("fetch", `重试 ${attempt}/2: ${String(err)}`),
    });
    log("fetch", `获取到 ${grades.length} 条记录`);
    for (const item of grades) {
      log(
        "fetch",
        `${item.kcmc} | ${item.xnmmc} ${item.xqmmc} | 成绩:${item.bfzcj}(${item.cj}) | 绩点:${item.jd} | 学分:${item.xf} | ${item.ksxz} | ${item.kcxzmc}`,
      );
    }

    if (grades.length === 0) {
      log("fetch", "成绩列表为空");
    }

    log("store", "检测增量变动...");
    const oldData = loadStore();
    log("store", `历史记录: ${oldData.size} 条`);

    const changes = detectChanges(oldData, grades);
    log("store", `新增: ${changes.added.length} 门, 变动: ${changes.changed.length} 门`);

    if (changes.added.length > 0) {
      for (const item of changes.added) {
        log("store", `+ ${item.kcmc}: ${item.bfzcj} (${item.cj})`);
      }
    }

    if (changes.changed.length > 0) {
      for (const c of changes.changed) {
        log("store", `~ ${c.kcmc}: ${c.oldBfzcj} -> ${c.newBfzcj}`);
      }
    }

    log("notify", "生成通知...");
    await notify(changes, config.email);

    log("email", "发送测试邮件...");
    if (config.email) {
      await notify(
        {
          added: [
            {
              kcmc: "测试邮件",
              bfzcj: "100",
              cj: "100",
              jd: "4.0",
              xf: "0",
              ksxz: "测试",
              key: "test",
              kch: "",
              kkxbmc: "",
              jsxm: "",
              xnmmc: "",
              xqmmc: "",
              kcxzmc: "",
              cjbdsj: "",
              jxbmc: "",
            },
          ],
          changed: [],
        },
        config.email,
      );
    } else {
      log("email", "未配置 SMTP，跳过");
    }

    log("done", "测试完成");
  } finally {
    await page.close();
  }
}

main()
  .catch((err) => {
    log("fail", String(err));
    process.exit(1);
  })
  .finally(() => {
    setTimeout(() => process.exit(0), 500);
  });
