import { loadConfig } from "./config.js";
import { login } from "./auth.js";
import { fetchExams, type ExamItem } from "./exam.js";
import { fetchGrades } from "./fetch.js";
import {
  detectChanges,
  detectExamChanges,
  hasExamStore,
  hasGradeStore,
  loadExamStore,
  loadStore,
  saveExamStore,
  saveStore,
  type ExamChangeRecord,
} from "./store.js";
import { notify } from "./notify.js";
import { retry } from "./retry.js";
import { log } from "./log.js";

async function main() {
  log("config", "加载配置...");
  const config = loadConfig();
  log("config", `学号: ${config.studentId}`);

  log("auth", "登录中...");
  const { page, browser } = await retry(() => login(config.studentId, config.password), {
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

    let exams: ExamItem[] | null = null;
    try {
      log("fetch", "抓取考试信息...");
      exams = await retry(() => fetchExams(page), {
        onRetry: (attempt, err) => log("fetch", `考试信息重试 ${attempt}/2: ${String(err)}`),
      });
      log("fetch", `获取到 ${exams.length} 条考试安排`);
      for (const item of exams) {
        const place = [item.cdxqmc || item.xqmc, item.cdmc].filter(Boolean).join(" ") || "地点未公布";
        log("fetch", `${item.kcmc}: ${item.kssj || "时间未公布"} | ${place} | 座号: ${item.zwh || "未公布"}`);
      }
    } catch (err) {
      log("fetch", `考试信息抓取失败，跳过考试检测: ${String(err)}`);
    }

    const isFirstRun = !hasGradeStore();
    const oldData = loadStore();
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

    let isFirstExamRun = false;
    let examChanges: { added: ExamItem[]; changed: ExamChangeRecord[] } | undefined;
    if (exams) {
      isFirstExamRun = !hasExamStore();
      const oldExamData = loadExamStore();
      log("store", `历史考试: ${oldExamData.size} 条${isFirstExamRun ? " (首次运行)" : ""}`);

      examChanges = detectExamChanges(oldExamData, exams);
      log("store", `新增考试: ${examChanges.added.length} 门, 变动: ${examChanges.changed.length} 门`);

      if (examChanges.added.length > 0) {
        for (const item of examChanges.added) {
          log("store", `+ ${item.kcmc}: ${item.kssj || "时间未公布"} | ${item.cdmc || "地点未公布"}`);
        }
      }

      if (examChanges.changed.length > 0) {
        for (const c of examChanges.changed) {
          log("store", `~ ${c.kcmc}: ${c.oldKssj || "时间未公布"} -> ${c.newKssj || "时间未公布"}`);
        }
      }
    }

    if (isFirstRun) log("notify", "成绩首次运行，跳过成绩通知");
    if (isFirstExamRun) log("notify", "考试信息首次运行，跳过考试通知");

    const gradeChangesForNotify = isFirstRun ? { added: [], changed: [] } : changes;
    const examChangesForNotify =
      exams && examChanges ? (isFirstExamRun ? { added: [], changed: [] } : examChanges) : undefined;

    log("notify", "生成通知...");
    await notify(gradeChangesForNotify, config.email, examChangesForNotify);

    saveStore(grades);
    log("store", `已保存 ${grades.length} 条记录`);
    if (exams) {
      saveExamStore(exams);
      log("store", `已保存 ${exams.length} 条考试安排`);
    }
    log("done", "完成");
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((err) => {
  log("fail", String(err));
  process.exit(1);
});
