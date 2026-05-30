import { chromium, type Browser, type Page } from "playwright";
import { execSync } from "node:child_process";

const BASE = "https://jwxt2018.gxu.edu.cn";
const LOGIN_URL = `${BASE}/jwglxt/xtgl/login_slogin.html`;

function cleanupZombies() {
  try {
    execSync("pkill -f chrome-headless-shell", { timeout: 5000 });
  } catch {
    // 没有残留进程则忽略
  }
}

export async function login(studentId: string, password: string): Promise<{ page: Page; browser: Browser }> {
  cleanupZombies();

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-sync",
      "--disable-translate",
      "--disable-default-apps",
      "--disable-component-update",
      "--mute-audio",
      "--hide-scrollbars",
    ],
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
    const page = await context.newPage();

    await page.goto(LOGIN_URL, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2000);

    await page.locator("#yhm").fill(studentId);
    await page.locator("#mm").fill(password);

    const loginBtn = page.locator("button:has-text('登')");
    if ((await loginBtn.count()) > 0) {
      await loginBtn.first().click();
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForTimeout(4000);

    if (page.url().includes("slogin")) {
      const err = await page.textContent("#alertErr").catch(() => "");
      throw new Error(`登录失败${err ? `: ${err}` : ""}`);
    }

    return { page, browser };
  } catch (err) {
    await browser.close();
    throw err;
  }
}
