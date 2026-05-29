import { loadConfig } from "./config.js";
import { login } from "./auth.js";
import { fetchGrades } from "./fetch.js";
import { loadStore, detectChanges, saveStore } from "./store.js";
import { notify } from "./notify.js";
import { retry } from "./retry.js";

async function main() {
  const config = loadConfig();

  const page = await retry(() => login(config.studentId, config.password), {
    onRetry: (attempt, err) => console.error(`登录重试 ${attempt}/2:`, String(err)),
  });

  try {
    const grades = await retry(() => fetchGrades(page), {
      onRetry: (attempt, err) => console.error(`抓取重试 ${attempt}/2:`, String(err)),
    });
    console.log(`获取到 ${grades.length} 条成绩记录`);

    const oldData = loadStore();
    const changes = detectChanges(oldData, grades);
    notify(changes);
    saveStore(grades);
  } finally {
    await page.close();
  }
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
