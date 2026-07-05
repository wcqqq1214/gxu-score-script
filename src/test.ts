import { loadConfig } from "./config.js";
import { login } from "./auth.js";
import { fetchExams } from "./exam.js";
import { fetchGrades } from "./fetch.js";
import { detectChanges, detectExamChanges, loadExamStore, loadStore } from "./store.js";
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

    log("fetch", "抓取考试信息...");
    const exams = await retry(() => fetchExams(page), {
      onRetry: (attempt, err) => log("fetch", `考试信息重试 ${attempt}/2: ${String(err)}`),
    });
    log("fetch", `获取到 ${exams.length} 条考试安排`);
    for (const item of exams) {
      const place = [item.cdxqmc || item.xqmc, item.cdmc].filter(Boolean).join(" ") || "地点未公布";
      log("fetch", `${item.kcmc}: ${item.kssj || "时间未公布"} | ${place} | 座号: ${item.zwh || "未公布"}`);
    }

    log("store", "检测增量变动...");
    const oldData = loadStore();
    log("store", `历史记录: ${oldData.size} 条`);

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

    const oldExamData = loadExamStore();
    log("store", `历史考试: ${oldExamData.size} 条`);

    const examChanges = detectExamChanges(oldExamData, exams);
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
              jxbmc: "",
              jsxm: "",
              xnmmc: "",
              xqmmc: "",
              kcxzmc: "",
              cjbdsj: "",
            },
          ],
          changed: [],
        },
        config.email,
        {
          added: [
            {
              key: "test-exam",
              kcmc: "测试考试",
              kch: "",
              kssj: "2099-01-01 09:00-11:00",
              cdmc: "测试教室",
              cdxqmc: "测试校区",
              xqmc: "",
              zwh: "1",
              cxbj: "",
              zxbj: "",
              ksmc: "测试考试批次",
              jsxx: "",
              jxbmc: "",
              kkxy: "",
              xf: "0",
              ksfs: "笔试",
              sjbh: "",
              bz1: "",
            },
          ],
          changed: [],
        },
      );
    } else {
      log("email", "未配置 SMTP，跳过");
    }

    log("done", "测试完成");
  } finally {
    await page.close();
    await browser.close();
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
