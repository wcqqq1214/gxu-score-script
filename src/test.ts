import { loadConfig } from "./config.js";
import { login } from "./auth.js";
import { fetchGrades } from "./fetch.js";
import { loadStore, detectChanges, saveStore } from "./store.js";
import { notify } from "./notify.js";

function log(step: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${timestamp}] [${step}]`, ...args);
}

function logSection(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

async function main() {
  logSection("测试: 配置加载");
  try {
    const config = loadConfig();
    log("config", `学号: ${config.studentId}, 密码: ***`);
  } catch (err) {
    log("config", "FAIL", err);
    process.exit(1);
  }

  logSection("测试: 登录");
  const config = loadConfig();
  const page = await login(config.studentId, config.password);
  log("auth", `登录成功, 当前 URL: ${page.url()}`);

  try {
    logSection("测试: 成绩抓取");
    const grades = await fetchGrades(page);
    log("fetch", `获取到 ${grades.length} 条记录`);
    for (const item of grades) {
      log(
        "fetch",
        `${item.kcmc} | ${item.xnmmc} ${item.xqmmc} | 成绩:${item.bfzcj}(${item.cj}) | 绩点:${item.jd} | 学分:${item.xf} | ${item.ksxz} | ${item.kcxzmc}`,
      );
    }

    if (grades.length === 0) {
      log("fetch", "WARN 成绩列表为空");
    }

    logSection("测试: 增量检测");
    const oldData = loadStore();
    log("store", `历史记录: ${oldData.size} 条`);

    const changes = detectChanges(oldData, grades);
    log("store", `新增: ${changes.added.length}, 变动: ${changes.changed.length}`);

    if (changes.added.length > 0) {
      log("store", "新增明细:");
      for (const item of changes.added) {
        log("store", `  + ${item.kcmc}: ${item.bfzcj} (${item.cj})`);
      }
    }

    if (changes.changed.length > 0) {
      log("store", "变动明细:");
      for (const c of changes.changed) {
        log("store", `  ~ ${c.kcmc}: ${c.oldBfzcj} -> ${c.newBfzcj}`);
      }
    }

    logSection("测试: 保存数据");
    saveStore(grades);
    log("store", `已保存 ${grades.length} 条记录到 data/grades.json`);

    logSection("测试: 通知");
    notify(changes);

    logSection("测试完成");
  } finally {
    await page.close();
  }
}

main().catch((err) => {
  log("test", "FAIL", err);
  process.exit(1);
});
