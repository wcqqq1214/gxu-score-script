import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mode = process.argv[2] || "success";
const directory = mkdtempSync(join(tmpdir(), "gxu-lifecycle-"));
console.log(`FIXTURE_DIRECTORY=${directory}`);
process.chdir(directory);
process.env.GXU_STUDENT_ID = "fixture-student";
process.env.GXU_PASSWORD = "fixture-password";
delete process.env.SMTP_HOST;
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));

const launch = chromium.launch.bind(chromium);
let active = 0;
chromium.launch = async (options) => {
  if (active !== 0) throw new Error("Previous browser is still active");
  const browser = await launch(options);
  active++;
  console.log("FIXTURE_BROWSER_OPEN");
  if (mode === "hard-hang") {
    setTimeout(() => {
      console.log("FIXTURE_EVENT_LOOP_BLOCKED");
      while (true) {}
    }, 8000);
  }
  browser.on("disconnected", () => {
    active--;
    console.log("FIXTURE_BROWSER_CLOSED");
  });
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.includes("doType=query")) {
        if (["hang", "hard-hang", "request-timeout"].includes(mode)) return;
        const item = url.includes("cjcx")
          ? { key: "fixture-grade", kcmc: "测试课程", bfzcj: "90", xf: "2", ksxz: "正常考试" }
          : { key: "fixture-exam", kcmc: "测试课程", kssj: "2099-01-01 09:00", cdmc: "测试教室" };
        await route.fulfill({ json: { items: [item], totalResult: 1 } });
      } else if (url.includes("login_slogin")) {
        const click = mode === "login-failure" ? "" : "location.href='/jwglxt/home.html'";
        await route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<input id="yhm"><input id="mm"><button onclick="${click}">登录</button><div id="alertErr">fixture rejection</div>`,
        });
      } else {
        await route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: '<form id="searchForm"><input name="xnm" value="2099"><input name="xqm" value="3"></form>',
        });
      }
    });
    return context;
  };
  return browser;
};

if (mode === "request-timeout") {
  const { login } = await import("../src/auth.ts");
  const { fetchGrades } = await import("../src/fetch.ts");
  const { closeBrowser, runTask } = await import("../src/runtime.ts");
  await runTask(async () => {
    const { page, browser } = await login("fixture-student", "fixture-password");
    try {
      await fetchGrades(page);
    } finally {
      await closeBrowser(browser);
    }
  });
} else {
  await import("../src/main.ts");
}
