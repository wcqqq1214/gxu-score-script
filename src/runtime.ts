import type { Browser } from "playwright";
import { getLastStage, log } from "./log.js";

const controller = new AbortController();
export const taskSignal = controller.signal;
let retries = 0;

export function recordRetry() {
  retries++;
}

export async function closeBrowser(browser: Browser) {
  try {
    await browser.close();
  } catch (error) {
    controller.abort(error);
    log("cleanup", `浏览器关闭失败，停止后续重试: ${String(error)}`, "error");
    throw error;
  }
}

export async function runTask(main: () => Promise<void>) {
  const startedAt = Date.now();
  let reason = "success";

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      reason = signal;
      process.exitCode = signal === "SIGTERM" ? 143 : 130;
      controller.abort(new Error(`任务收到 ${signal}`));
      log("run", `收到 ${signal}，停止重试并等待浏览器退出`, "warn");
    });
  }

  process.once("exit", (code) => {
    log(
      "run",
      `结束 reason=${reason} code=${code} durationMs=${Date.now() - startedAt} retries=${retries} stage=${getLastStage()}`,
      code === 0 ? "info" : "error",
    );
  });

  log("run", "开始");
  try {
    await main();
    taskSignal.throwIfAborted();
  } catch (error) {
    if (reason === "success") reason = "error";
    process.exitCode ||= 1;
    log("fail", String(error), "error");
  }
}
