import { chromium, type Page } from "playwright";

const BASE = "https://jwxt2018.gxu.edu.cn";
const LOGIN_URL = `${BASE}/jwglxt/xtgl/login_slogin.html`;

export async function login(studentId: string, password: string): Promise<Page> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
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

  return page;
}
