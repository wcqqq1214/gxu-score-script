import { loadConfig } from "./config.js";
import { login } from "./auth.js";
import { fetchGrades } from "./fetch.js";
import { loadStore, detectChanges, saveStore } from "./store.js";
import { notify } from "./notify.js";
import { retry } from "./retry.js";
import { log } from "./log.js";

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
      log("fetch", `${item.kcmc}: ${item.bfzcj} | 学分: ${item.xf} | ${item.ksxz}`);
    }

    const oldData = loadStore();
    const isFirstRun = oldData.size === 0;
    log("store", `历史记录: ${oldData.size} 条${isFirstRun ? " (首次运行)" : ""}`);

    const changes = detectChanges(oldData, grades);
    log("store", `新增: ${changes.added.length} 门, 变动: ${changes.changed.length} 门`);

    if (changes.added.length > 0) {
      for (const item of changes.added) {
        log("store", `+ ${item.kcmc}: ${item.bfzcj} | 学分: ${item.xf} | ${item.ksxz}`);
      }
    }

    if (changes.changed.length > 0) {
      for (const c of changes.changed) {
        log("store", `~ ${c.kcmc}: ${c.oldBfzcj} -> ${c.newBfzcj}`);
      }
    }

    if (isFirstRun) {
      log("notify", "首次运行，跳过通知");
    } else {
      log("notify", "生成通知...");
      await notify(changes, config.email);
    }

    saveStore(grades);
    log("store", `已保存 ${grades.length} 条记录`);
    log("done", "完成");
  } finally {
    await page.close();
  }
}

main().catch((err) => {
  log("fail", String(err));
  process.exit(1);
});
